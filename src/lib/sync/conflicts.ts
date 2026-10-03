/**
 * Conflict detection & merge policy (pure functions — no DB access, fully unit
 * testable). See sync.md §6.5.
 *
 * Rules, in order:
 *  1. no local pending change            -> apply remote
 *  2. disjoint changed fields            -> auto-merge both
 *  3. same field, one side strictly newer-> per-field LWW by (lamport, deviceId)
 *  4. same field, ambiguous, or structural-> manual queue
 *  5. tombstone vs edit                  -> deletion wins unless the edit is newer
 */

export interface LocalSnapshot {
  data: Record<string, unknown>
  lamport: number
  deviceId: string
  localRev: number
  deletedAt: number | null
}

export interface RemoteSnapshot {
  id: string
  data: Record<string, unknown>
  lamport: number
  deviceId: string
  deletedAt: number | null
}

export interface FieldConflict {
  field: string
  localValue: unknown
  remoteValue: unknown
  localRev: number
  remoteRev: number
}

export type MergeDecision =
  | { action: 'apply'; merged: Record<string, unknown>; note?: string }
  | { action: 'skip'; note: string; keepDirty?: boolean }
  | { action: 'conflict'; merged: Record<string, unknown>; conflicts: FieldConflict[] }

/** Lamport + device id gives a total order that every replica computes identically. */
function lwwWins(
  local: { lamport: number; deviceId: string },
  remote: { lamport: number; deviceId: string },
): boolean {
  if (remote.lamport !== local.lamport) return remote.lamport > local.lamport
  return remote.deviceId > local.deviceId
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * @param pendingKeys fields with unsent local changes (from the outbox patches)
 */
export function mergeRemote(
  local: LocalSnapshot,
  remote: RemoteSnapshot,
  pendingKeys: Set<string>,
  structuralFields: Set<string>,
): MergeDecision {
  // Nothing pending locally: the server copy simply wins.
  if (pendingKeys.size === 0) return { action: 'apply', merged: remote.data }

  // Deletion vs edit: whichever happened at a later logical time wins; a strictly
  // newer edit resurrects the doc, an equal-time case is a conflict for a human.
  if (local.deletedAt != null || remote.deletedAt != null) {
    if (local.deletedAt != null && remote.deletedAt == null) {
      if (remote.lamport > local.lamport) return { action: 'apply', merged: remote.data, note: 'edited after local delete' }
      if (remote.lamport === local.lamport) {
        return {
          action: 'conflict',
          merged: local.data,
          conflicts: [{ field: 'deletedAt', localValue: local.deletedAt, remoteValue: null, localRev: local.localRev, remoteRev: remote.lamport }],
        }
      }
      return { action: 'skip', note: 'local delete is newer', keepDirty: true }
    }
    if (remote.deletedAt != null && local.deletedAt == null) {
      if (local.lamport > remote.lamport) return { action: 'skip', note: 'local edit is newer than the server delete', keepDirty: true }
      return { action: 'apply', merged: remote.data, note: 'server delete is newer' }
    }
    return { action: 'skip', note: 'deleted on both sides', keepDirty: true }
  }

  const merged: Record<string, unknown> = { ...local.data }
  const conflicts: FieldConflict[] = []
  const keys = new Set([...Object.keys(local.data), ...Object.keys(remote.data)])
  const remoteChanged = new Set<string>()

  for (const key of keys) {
    if (key === 'id' || key === 'syncLamport' || key === 'syncOpId' || key === 'syncDeviceId') continue
    const lv = local.data[key]
    const rv = remote.data[key]
    if (sameValue(lv, rv)) continue
    remoteChanged.add(key)

    if (!pendingKeys.has(key)) {
      merged[key] = rv // 2. disjoint edits -> auto-merge
      continue
    }
    if (structuralFields.has(key) || (isObject(lv) !== isObject(rv)) || Array.isArray(lv) || Array.isArray(rv)) {
      conflicts.push({ field: key, localValue: lv, remoteValue: rv, localRev: local.lamport, remoteRev: remote.lamport })
      continue
    }
    if (lwwWins(local, remote)) {
      merged[key] = rv // 3. deterministic last-writer-wins
    } else {
      merged[key] = lv
    }
  }

  if (conflicts.length === 0) {
    return {
      action: 'apply',
      merged,
      note: remoteChanged.size > 0 && pendingKeys.size > 0 ? 'auto-merged disjoint edits' : undefined,
    }
  }
  return { action: 'conflict', merged, conflicts }
}