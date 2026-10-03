/**
 * SyncEngine — the stepped, resumable sync.
 *
 * A run is an ordered plan (see schema.ts PLAN_ORDER). Each step persists its
 * own status + cursor in `sync_state`, so a dropped connection resumes ONLY the
 * failed step, from where it stopped:
 *
 *   preflight -> push-outbox -> pull-sessions -> pull-people ->
 *   pull-academics -> pull-ops -> pull-comms -> reconcile -> conflicts -> finalize
 *
 * Push is idempotent by construction (deterministic ids, doc-carried
 * syncLamport/syncOpId, create-then-update fallback), so replaying a batch
 * after a timeout can never duplicate or lose data.
 *
 * Honest limitation (sync.md §6.3): the Firestore web SDK has no multi-document
 * transactions and Cloud Functions are out of scope, so "transactional" here
 * means ordered steps + durable checkpoints + idempotent re-runs.
 */
import type { DataProvider, WhereOp } from '../data/provider'
import { PLAN_COLLECTIONS, PLAN_ORDER, type PlanStepId } from './schema'
import { applyRemoteDoc, markClean, newOpId } from './localProvider'
import { createBackup } from './backups'
import { pruneHistory } from './changelog'
import { buildPullPlan, type PullContext, type PullTarget } from './pullPlan'
import { startRun, finishRun } from './queue'
import { deviceId, flush, getDb, getJsonMeta, markDirty, setJsonMeta } from './sqlite'

const PUSH_BATCH = 400
const PULL_PAGE = 200
const BACKOFF_MS = [1000, 2000, 4000, 8000, 30000]
const OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const HISTORY_KEEP_ROWS = 50_000

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface StepState {
  step: PlanStepId
  status: StepStatus
  cursor: string | null
  startedAt: number | null
  finishedAt: number | null
  error: string | null
  attempt: number
  /** Human-readable detail for the Settings > Sync list. */
  detail?: string
}

export interface SyncProgress {
  running: boolean
  step: PlanStepId | null
  steps: StepState[]
  startedAt: number | null
  finishedAt: number | null
  lastError: string | null
  pushed: number
  pulled: number
  conflicts: number
  mode: SyncMode
}

export type SyncMode = 'full' | 'push' | 'pull'

export interface SyncOptions {
  mode?: SyncMode
  /** Re-run only this step (the "Retry failed step" button). */
  onlyStep?: PlanStepId
  collections?: string[]
  signal?: AbortSignal
}

// ---------------------------------------------------------------- state store

function run(sql: string, params: unknown[] = []) {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    while (stmt.step()) { /* drain */ }
  } finally {
    stmt.free()
  }
}
function all<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params as never)
    const out: T[] = []
    while (stmt.step()) out.push(stmt.getAsObject() as T)
    return out
  } finally {
    stmt.free()
  }
}

export function readSteps(): StepState[] {
  return (all<Record<string, unknown>>('SELECT * FROM sync_state')).map((r) => ({
    step: String(r.step) as PlanStepId,
    status: String(r.status) as StepStatus,
    cursor: r.cursor == null ? null : String(r.cursor),
    detail: r.detail == null ? undefined : String(r.detail),
    startedAt: r.started_at == null ? null : Number(r.started_at),
    finishedAt: r.finished_at == null ? null : Number(r.finished_at),
    error: r.error == null ? null : String(r.error),
    attempt: Number(r.attempt ?? 0),
  }))
}

function ensureStep(step: PlanStepId): StepState {
  run(`INSERT INTO sync_state (step, status, attempt) VALUES (?, 'pending', 0) ON CONFLICT(step) DO NOTHING`, [step])
  const row = readSteps().find((s) => s.step === step)
  return row ?? { step, status: 'pending', cursor: null, startedAt: null, finishedAt: null, error: null, attempt: 0 }
}

function setStep(step: PlanStepId, patch: Partial<StepState>) {
  const cur = ensureStep(step)
  const next = { ...cur, ...patch }
  run(
    `INSERT INTO sync_state (step, status, cursor, detail, started_at, finished_at, error, attempt) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(step) DO UPDATE SET status = excluded.status, cursor = excluded.cursor,
       detail = excluded.detail, started_at = excluded.started_at, finished_at = excluded.finished_at,
       error = excluded.error, attempt = excluded.attempt`,
    [step, next.status, next.cursor, next.detail ?? null, next.startedAt, next.finishedAt, next.error, next.attempt],
  )
  emit()
}

// ---------------------------------------------------------------- progress bus

type Listener = (p: SyncProgress) => void
const listeners = new Set<Listener>()

let current: SyncProgress = {
  running: false,
  step: null,
  steps: readStepsSafe(),
  startedAt: null,
  finishedAt: null,
  lastError: null,
  pushed: 0,
  pulled: 0,
  conflicts: 0,
  mode: 'full',
}

function readStepsSafe(): StepState[] {
  try {
    return readSteps()
  } catch {
    return []
  }
}

function emit() {
  current = { ...current, steps: readStepsSafe() }
  for (const l of listeners) l(current)
}

export function subscribeSync(l: Listener): () => void {
  listeners.add(l)
  l(current)
  return () => listeners.delete(l)
}

export function syncSnapshot(): SyncProgress {
  return { ...current, steps: readStepsSafe() }
}

export const lastSyncAt = () => Number(getJsonMeta('last_sync_at', 0)) || null
const setLastSyncAt = (v: number) => setJsonMeta('last_sync_at', v)

// ---------------------------------------------------------------- watermarks

type Watermarks = Record<string, number>
const watermarks = (): Watermarks => getJsonMeta<Watermarks>('watermarks', {})
const saveWatermarks = (w: Watermarks) => setJsonMeta('watermarks', w)

const log = (...args: unknown[]) => console.info('[sync]', ...args)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- engine

export interface SyncDeps {
  remote: DataProvider
  /** Injected in tests. */
  isOnline?: () => boolean
  /** Retry backoff; tests shorten this so the suite stays fast. */
  backoffMs?: number[]
  /** Role/ids used to build the permission-aware pull plan. */
  pullContext?: PullContext
}

let deps: SyncDeps | null = null
export function configureSync(d: SyncDeps) {
  deps = d
}

const backoff = () => deps?.backoffMs ?? BACKOFF_MS

/** Who is syncing — decides which collections may be pulled (see pullPlan.ts). */
export function setPullContext(ctx: PullContext) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('bmrc-sync-user', JSON.stringify(ctx))
  setJsonMeta('pull_context', ctx)
}

function pullContext(): PullContext {
  if (deps?.pullContext) return deps.pullContext
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('bmrc-sync-user') : null
  if (stored) {
    try {
      return JSON.parse(stored) as PullContext
    } catch {
      /* fall through */
    }
  }
  const persisted = getJsonMeta<PullContext | null>('pull_context', null)
  return persisted ?? { role: 'admin', uid: '', childIds: [] }
}

export function isOnline(): boolean {
  if (deps?.isOnline) return deps.isOnline()
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

let runningPromise: Promise<SyncProgress> | null = null

export function runSync(options: SyncOptions = {}): Promise<SyncProgress> {
  if (runningPromise) return runningPromise
  runningPromise = execute(options).finally(() => {
    runningPromise = null
  })
  return runningPromise
}

async function execute(options: SyncOptions): Promise<SyncProgress> {
  const mode = options.mode ?? 'full'
  current = { ...current, running: true, step: null, startedAt: Date.now(), finishedAt: null, lastError: null, pushed: 0, pulled: 0, conflicts: 0, mode }
  for (const step of PLAN_ORDER) ensureStep(step)
  emit()
  const runId = startRun(mode)

  try {
    if (options.onlyStep) {
      await runStepWithRetry(options.onlyStep, options)
    } else {
      for (const step of planFor(mode)) {
        if (options.signal?.aborted) break
        await runStepWithRetry(step, options)
      }
    }
    current = { ...current, running: false, step: null, finishedAt: Date.now() }
    emit()
    finishRun(runId, {
      status: 'done',
      pushed: current.pushed,
      pulled: current.pulled,
      conflicts: current.conflicts,
      failedStep: null,
      error: null,
      steps: snapshotSteps(),
    })
    return syncSnapshot()
  } catch (e) {
    const failedStep = current.step
    current = { ...current, running: false, step: null, finishedAt: Date.now(), lastError: e instanceof Error ? e.message : String(e) }
    emit()
    finishRun(runId, {
      status: 'failed',
      pushed: current.pushed,
      pulled: current.pulled,
      conflicts: current.conflicts,
      failedStep,
      error: current.lastError,
      steps: snapshotSteps(),
    })
    return syncSnapshot()
  }
}

function snapshotSteps() {
  return readSteps().map((s) => ({
    step: s.step,
    status: s.status,
    detail: s.detail ?? undefined,
    error: s.error,
    attempt: s.attempt,
    durationMs: s.startedAt && s.finishedAt ? s.finishedAt - s.startedAt : null,
  }))
}

function planFor(mode: SyncMode): PlanStepId[] {
  if (mode === 'push') return ['push-outbox', 'finalize']
  if (mode === 'pull') return ['preflight', ...PLAN_ORDER.filter((s) => s.startsWith('pull-')), 'conflicts', 'finalize']
  return PLAN_ORDER
}

async function runStepWithRetry(step: PlanStepId, options: SyncOptions) {
  const cur = ensureStep(step)
  // already done and nothing to redo -> skip (this is what makes re-runs cheap)
  if (cur.status === 'done' && !options.onlyStep && step !== 'push-outbox' && step !== 'reconcile' && step !== 'conflicts') {
    setStep(step, { status: 'done', detail: 'already up to date' })
    return
  }
  const waits = backoff()
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    setStep(step, { status: 'running', startedAt: Date.now(), attempt: attempt + 1, error: null })
    current = { ...current, step }
    emit()
    try {
      await runStep(step, options)
      setStep(step, { status: 'done', finishedAt: Date.now(), error: null })
      return
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (attempt === waits.length) {
        setStep(step, { status: 'failed', finishedAt: Date.now(), error: message })
        current = { ...current, lastError: message }
        emit()
        throw e
      }
      const wait = waits[attempt] ?? BACKOFF_MS[0] ?? 1000
      log(`step ${step} failed (${message}) - retry ${attempt + 1} in ${wait}ms`)
      await sleep(wait)
    }
  }
}

// ---------------------------------------------------------------- steps

async function runStep(step: PlanStepId, options: SyncOptions) {
  switch (step) {
    case 'preflight': return preflight()
    case 'push-outbox': return pushOutbox('push-outbox')
    case 'pull-sessions': return pullGroup('pull-sessions', options)
    case 'pull-people': return pullGroup('pull-people', options)
    case 'pull-academics': return pullGroup('pull-academics', options)
    case 'pull-ops': return pullGroup('pull-ops', options)
    case 'pull-comms': return pullGroup('pull-comms', options)
    case 'reconcile': return pushOutbox('reconcile')
    case 'conflicts': return countConflicts()
    case 'finalize': return finalize()
  }
}

function remote(): DataProvider {
  if (!deps?.remote) throw new Error('SyncEngine not configured - call configureSync()')
  return deps.remote
}

async function preflight() {
  if (!isOnline()) throw new Error('offline')
  // Cheap authenticated read: proves the session works before we touch anything.
  await remote().get('settings', 'school')
  const pending = all<{ c: number }>('SELECT COUNT(*) c FROM docs WHERE dirty = 1')[0]?.c ?? 0
  if (pending > 0) {
    const b = await createBackup('pre-sync')
    setStep('preflight', { detail: `backed up ${b.bytes} bytes before syncing ${pending} pending docs` })
  } else {
    setStep('preflight', { detail: 'no local changes to push' })
  }
}

interface OutboxRow {
  op_id: string
  collection: string
  doc_id: string
  op: string
  patch: string
  lamport: number
  created_at: number
}

async function pushOutbox(step: 'push-outbox' | 'reconcile') {
  if (!isOnline()) throw new Error('offline')
  const rows = all<OutboxRow>(
    'SELECT op_id, collection, doc_id, op, patch, lamport, created_at FROM outbox WHERE pushed_at IS NULL ORDER BY created_at ASC LIMIT ?',
    [PUSH_BATCH],
  )
  if (rows.length === 0) {
    setStep(step, { detail: 'outbox empty', cursor: null })
    return
  }

  for (const row of rows) {
    const patch = safeParse<Record<string, unknown>>(row.patch, {})
    const payload = {
      ...patch,
      syncLamport: row.lamport,
      syncOpId: row.op_id,
      syncDeviceId: deviceId(),
      updatedAt: Number(patch.updatedAt ?? Date.now()),
    }
    if (row.op === 'create') {
      try {
        await remote().create(row.collection, payload, row.doc_id)
      } catch {
        // Already exists (replayed batch) -> converge with an update instead.
        await remote().update(row.collection, row.doc_id, payload)
      }
    } else {
      try {
        await remote().update(row.collection, row.doc_id, payload)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/not found/i.test(msg)) throw e
        await remote().create(row.collection, payload, row.doc_id)
      }
    }
    run('UPDATE outbox SET pushed_at = ?, step = ? WHERE op_id = ?', [Date.now(), step, row.op_id])
    markClean(row.collection, row.doc_id)
    current = { ...current, pushed: current.pushed + 1 }
  }
  setStep(step, { detail: `pushed ${rows.length} op(s)`, cursor: rows[rows.length - 1]!.op_id })
  emit()
  // keep draining until the outbox for this pass is empty
  const left = all<{ c: number }>('SELECT COUNT(*) c FROM outbox WHERE pushed_at IS NULL')[0]?.c ?? 0
  if (left > 0) await pushOutbox(step)
}

async function pullGroup(group: keyof typeof PLAN_COLLECTIONS, options: SyncOptions) {
  const ctx = pullContext()
  const { targets } = buildPullPlan(ctx)
  const planned = groupTargets(group)
  const wm = watermarks()
  const scope = options.collections?.length ? planned.filter((c) => options.collections!.includes(c)) : planned
  let pulledThisGroup = 0
  const denied: string[] = []
  let skippedRole = 0

  for (const name of scope) {
    const target = targets.find((t) => t.collection === name)
    if (!target) {
      skippedRole++
      continue // not readable for this role by design (permissions.ts matrix)
    }
    if (options.signal?.aborted) throw new Error('cancelled')

    try {
      pulledThisGroup += await pullCollection(name, target, wm)
    } catch (e) {
      // One collection the rules reject must never fail the whole step:
      // record it, keep going, and surface it in the step detail.
      denied.push(`${name} (${e instanceof Error ? e.message : String(e)})`)
    }
    setStep(group, {
      cursor: JSON.stringify(wm),
      detail: `${pulledThisGroup} doc(s)${skippedRole ? `, ${skippedRole} not permitted for your role` : ''}${denied.length ? `, ${denied.length} denied` : ''}`,
    })
    emit()
  }

  // class subjects live in subcollections discovered from the classes we pulled
  if (group === 'pull-sessions') await pullSubjectSubcollections(wm)

  setStep(group, {
    cursor: JSON.stringify(wm),
    detail: denied.length
      ? `${pulledThisGroup} doc(s) pulled · not readable: ${denied.join(', ')}`
      : `${pulledThisGroup} doc(s) pulled${skippedRole ? ` · ${skippedRole} collection(s) skipped for your role` : ''}`,
  })
}

function groupTargets(group: keyof typeof PLAN_COLLECTIONS): string[] {
  return [...PLAN_COLLECTIONS[group]]
}

async function pullCollection(name: string, target: PullTarget, wm: Watermarks): Promise<number> {
  if (target.fanout) {
    const parents = await remote().list<Record<string, unknown>>(target.fanout.collection)
    let n = 0
    for (const value of target.fanout.values(parents)) {
      n += await pullPaged(name, wm, [[target.fanout.whereField, '==', value]])
    }
    return n
  }
  if (name === 'messages') return pullMessages(wm)
  return pullPaged(name, wm, target.where)
}

async function pullPaged(collection: string, wm: Watermarks, base: [string, WhereOp, unknown][] | undefined): Promise<number> {
  let pulled = 0
  for (;;) {
    if (!isOnline()) throw new Error('offline')
    const since = wm[collection] ?? 0
    const where = [...(base ?? []), ...(since > 0 ? ([['updatedAt', '>', since]] as [string, WhereOp, unknown][]) : [])]
    const page = await remote().list<Record<string, unknown>>(collection, {
      where: where.length ? where : undefined,
      orderBy: ['updatedAt', 'asc'],
      limit: PULL_PAGE,
    })
    if (page.length === 0) break
    for (const doc of page) {
      applyRemoteDoc(collection, { ...doc, id: String(doc.id ?? '') })
      pulled++
    }
    current = { ...current, pulled: current.pulled + page.length }
    const maxUpdated = Math.max(...page.map((d) => Number(d.updatedAt ?? 0)))
    wm[collection] = Math.max(since, maxUpdated)
    saveWatermarks(wm)
    if (page.length < PULL_PAGE) break
  }
  return pulled
}

/**
 * Messages: `inThread()` splits threadId on '_', which no query filter can
 * reproduce. So we learn the user's thread ids from the messages they sent, then
 * pull each thread explicitly.
 */
async function pullMessages(wm: Watermarks): Promise<number> {
  const ctx = pullContext()
  if (!ctx.uid) return 0
  const mineOnes = await remote().list<Record<string, unknown>>('messages', { where: [['senderId', '==', ctx.uid]] })
  const threadIds = [...new Set(mineOnes.map((m) => String(m.threadId ?? '')).filter(Boolean))]
  let pulled = 0
  for (const threadId of threadIds) {
    pulled += await pullPaged('messages', wm, [['threadId', '==', threadId]])
  }
  return pulled
}

async function pullSubjectSubcollections(wm: Watermarks) {
  const classes = await remote().list<{ id: string }>('classes')
  for (const cls of classes) {
    const path = `classes/${cls.id}/subjects`
    await pullPaged(path, wm, undefined)
  }
}

function countConflicts() {
  const c = all<{ c: number }>('SELECT COUNT(*) c FROM conflicts WHERE resolved_at IS NULL')[0]?.c ?? 0
  current = { ...current, conflicts: c }
  setStep('conflicts', { detail: c === 0 ? 'no conflicts' : `${c} conflict(s) waiting for review` })
}

async function finalize() {
  const cutoff = Date.now() - OUTBOX_RETENTION_MS
  run('DELETE FROM outbox WHERE pushed_at IS NOT NULL AND pushed_at < ?', [cutoff])
  pruneHistory(HISTORY_RETENTION_MS, HISTORY_KEEP_ROWS)
  setLastSyncAt(Date.now())
  await flush()
  setStep('finalize', { detail: 'local snapshot written' })
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Used by tests and the first-run path. */
export function freshOpId() {
  return newOpId()
}

export function resetSyncState() {
  run('DELETE FROM sync_state')
  for (const step of PLAN_ORDER) ensureStep(step)
  markDirty()
  emit()
}