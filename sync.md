# Offline-first sync — design & implementation plan

Branch: `desktop` (based on `637e70a`). Status: **proposal**; foundation not yet written.

Revised scope after your call:

- **Phase 1 (now):** the existing web app (Vite + React, deployed to Netlify) becomes
  local-first — every read served from a local SQLite database, every write recorded locally and
  synced to Firestore when online. No Electron, no Node runtime, no native modules.
- **Phase 2 (later):** a proper **.NET desktop app** (its own UI, `Microsoft.Data.Sqlite`), not a
  wrapper around the web app.

The consequence that drives everything below: **Phase 1's local schema and sync protocol are a
shared contract.** The .NET app will read the same SQLite file and speak the same protocol, so the
schema, the outbox/changelog format, the lamport/LWW rules and the sync plan are specified here and
must stay stable. Nothing in Phase 1 may be browser-only in a way that can't be reimplemented in
C#.

---

## 1. Requirements (Phase 1)

| # | Requirement | Where |
|---|---|---|
| G1 | App works offline | SQLite is the read source of truth; UI never waits on network |
| G2 | App works online | Reads still come from SQLite; a sync reconciles with Firestore |
| G3 | Sync is a stepped transaction | Ordered plan of steps, each with a persisted checkpoint |
| G4 | Connection can drop mid-sync | Steps are idempotent; a failed run resumes at the failed step only |
| G5 | Conflicts handled | Auto-merge disjoint edits, deterministic per-field LWW, manual queue for structural fields |
| G6 | Backups | Manual + automatic (pre-sync / pre-restore / pre-reset), keep last 5, restore any |
| G7 | Change tracking + revert | Append-only changelog with before/after; any change revertible |
| G8 | Destructive resets need friction | Random on-screen OTP typed by the user; "local only" and "local + server" variants |
| G9 | All of it manageable in Settings | New tabs: Sync, Conflicts, Backups, History, Storage |

Out of scope for Phase 1: desktop shell, packaging, installers, true ACID transactions across
documents (Firestore web SDK has none — see §6.3), offline sign-in for first-time users.

---

## 2. Key decisions

### 2.1 Local storage in the browser

The app runs in a browser, so SQLite must be WASM. Two viable options:

| Option | Persistence | Needs headers | Notes |
|---|---|---|---|
| **A. `sql.js` + debounced file write** (recommended) | Whole DB serialized to a file/IndexedDB, debounced (~1.5 s) + on tab hide + on sync end | No | Works in every browser today, private mode, no cross-origin header changes. Cost: O(size) per save — fine for a school (single-digit MB), incremental per-doc work still happens in SQLite itself |
| B. `@sqlite.org/sqlite-wasm` OPFS VFS | True incremental writes | **Yes** — COOP + COEP headers, and cross-origin images can get blocked | Cleaner at scale, but needs `_headers` in `netlify.toml` and drops some browsers |

**Recommendation: A**, with the persistence layer behind a small interface so switching to B later
is a one-file change. Schema and protocol are unaffected either way.

Also decided by this constraint: the app stays a normal web app, so the *web deployment keeps
working* and the .NET app in Phase 2 is a separate codebase that reuses only the SQLite schema and
the sync protocol (not the React code).

### 2.2 Firestore access: signed-in user session (no bundled service account)

Sync uses the Firebase **web SDK with the signed-in session**, so `firestore.rules` applies exactly
as today. Shipping `firebase-admin` + a service-account key inside a distributed app would hand
every user a full rules bypass — not acceptable. Consequence: hard delete is still denied by the
rules, so "reset server data" needs a small, time-boxed rules change (§7) or an admin-only CLI.

### 2.3 SQLite is the source of truth, Firestore is a peer

UI reads always hit SQLite. Writes land in SQLite first and are pushed later. This is what makes
offline real (no read ever depends on the network) and it means a device can legitimately diverge
until its next sync. All session-scoped reads already filter by `sessionId`, so switching sessions
in the top bar keeps working on local data.

---

## 3. Architecture

```
┌────────────────────────── Browser tab ──────────────────────────┐
│ React app (unchanged components)                                 │
│   DataProvider ──> LocalProvider  ──> SQLite (WASM)              │
│                      ├─ docs        (mirror, dirty flags)        │
│                      ├─ outbox      (pending pushes)             │
│                      ├─ changelog   (history / revert)            │
│                      ├─ conflicts   (manual review queue)         │
│                      ├─ sync_state  (plan checkpoints)            │
│                      └─ backups     (metadata)                    │
│                          ▲                 ▲                     │
│                  LocalStore (txns)   SyncEngine (plan steps)     │
│                                    │                               │
│                          Firebase Web SDK (user session) ─────────┼──> Firestore
└───────────────────────────────────────────────────────────────────┘
```

`DataProvider` (`src/lib/data/provider.ts`) gains the pieces sync needs — it is extended, not
replaced, so `pnpm test`'s in-memory provider keeps working through a thin adapter:

- `beginLocalTransaction()` / `commitLocalTransaction()` / `rollbackLocalTransaction()`
- `applyRemotePatch(collection, id, patch, origin)` — used by pull and by restore
- `listLocalChanges({ collection, since, limit })` — used by the changelog view
- `stats()` — doc counts/bytes for the Storage tab

Every existing mutation (`create`, `update`, `softDelete`, `restore`, `bulkWrite`) keeps its
signature; the local provider additionally writes outbox + changelog rows in the same transaction.

---

## 4. SQLite schema (shared contract with Phase 2)

Single mirror table with JSON payloads + duplicated hot columns for indexed queries
(consistent with the app's `where` / `orderBy` usage). Values are the same JSON shapes as Firestore
(epoch-millis timestamps, `deletedAt` / `deletedBy` soft delete).

```sql
CREATE TABLE docs (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        TEXT NOT NULL,             -- JSON document
  updated_at  INTEGER NOT NULL,          -- doc updatedAt (ms)
  local_rev   INTEGER NOT NULL,          -- bumped on each local write
  lamport     INTEGER NOT NULL,          -- logical clock for LWW
  device_id   TEXT NOT NULL,
  deleted_at  INTEGER,                   -- tombstone
  dirty       INTEGER NOT NULL DEFAULT 0,-- unsent local change
  sync_state  TEXT NOT NULL DEFAULT 'synced', -- synced | dirty | conflict
  PRIMARY KEY (collection, id)
);
CREATE INDEX docs_collection_updated ON docs (collection, updated_at);
CREATE INDEX docs_dirty             ON docs (collection, dirty);

CREATE TABLE outbox (
  op_id       TEXT PRIMARY KEY,          -- ULID: idempotency key for the server write
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  op          TEXT NOT NULL,             -- create | update | delete
  patch       TEXT NOT NULL,             -- JSON of changed fields only
  base_rev    INTEGER NOT NULL,
  lamport     INTEGER NOT NULL,
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  pushed_at   INTEGER,                   -- NULL = pending
  step        TEXT
);
CREATE INDEX outbox_pending ON outbox (pushed_at, collection, created_at);

CREATE TABLE changelog (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id       TEXT NOT NULL,
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  op          TEXT NOT NULL,
  before      TEXT,                      -- JSON before
  after       TEXT,                      -- JSON after
  actor       TEXT,                      -- users doc id
  origin      TEXT NOT NULL,             -- local | remote | system
  device_id   TEXT NOT NULL,
  at          INTEGER NOT NULL,
  reverted_by INTEGER                     -- seq of the change this reverts
);

CREATE TABLE conflicts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  collection   TEXT NOT NULL,
  doc_id       TEXT NOT NULL,
  field        TEXT NOT NULL,
  local_value  TEXT,
  remote_value TEXT,
  local_rev    INTEGER NOT NULL,
  remote_rev   INTEGER NOT NULL,
  detected_at  INTEGER NOT NULL,
  resolved_at  INTEGER,
  resolution   TEXT                      -- local | remote | merged
);

CREATE TABLE sync_state (
  step        TEXT PRIMARY KEY,          -- plan step id
  status      TEXT NOT NULL,             -- pending | running | done | failed
  cursor      TEXT,                      -- watermark / page cursor for resume
  started_at  INTEGER,
  finished_at INTEGER,
  error       TEXT,
  attempt     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE backups (
  id         TEXT PRIMARY KEY,            -- 20261003T101500Z-manual
  created_at INTEGER NOT NULL,
  reason     TEXT NOT NULL,              -- manual | pre-sync | pre-restore | pre-reset | daily
  path       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  doc_count  INTEGER NOT NULL,
  sha256     TEXT NOT NULL
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, device_id, lamport, last_sync_at, current_user,
--       current_session_id, watermarks (JSON per collection)
```

Soft delete stays a tombstone (`deleted_at` + `deletedBy` in `data`), matching Firestore: a local
delete is pushed as an update, so no replica loses the document until every device has seen the
tombstone (30-day prune, same convention as the app's Trash).

---

## 5. Local write path (what makes offline safe)

All mutations funnel through one choke point instead of talking to Firestore:

```
UI mutation (create / edit / soft-delete / bulk / invoice generation / ...)
  └─ LocalProvider
        BEGIN
          docs      upsert (data, local_rev+1, lamport+1, dirty=1, sync_state='dirty')
          outbox    INSERT (op_id=ULID, patch=changed fields only)
          changelog INSERT (before, after, actor, device, origin='local')
        COMMIT
      └─ emit change event → TanStack Query invalidation (UI updates instantly, offline-safe)
```

One SQLite transaction covers doc + outbox + changelog, so local state can never contain a change
that isn't queued to push, or a queued change with no history. `bulkWrite` uses the same single
transaction instead of looping.

Lamport clock: `lamport = max(local, max seen from server) + 1`, persisted in `meta`, bumped on
every local write and every pulled doc. It gives a total order across devices without trusting
wall clocks (clocks in Indian schools sync badly).

---

## 6. Sync as a stepped, resumable transaction

### 6.1 The plan

| # | Step | Work | Resume cursor |
|---|---|---|---|
| 1 | `preflight` | online check, auth check, schema migration, **pre-sync backup** | — |
| 2 | `push-outbox` | pending ops grouped per collection, ≤400 writes per batch | last pushed `op_id` |
| 3 | `pull-sessions` | sessions, classes (+ `classes/{id}/subjects`) | `updated_at` watermark |
| 4 | `pull-people` | staff, students, users | watermark |
| 5 | `pull-academics` | assignments, exams, marks, gradingScales, templates | watermark |
| 6 | `pull-ops` | attendance, timetable, timetableConfig, feeTypes, feeAssignments, invoices, payments | watermark |
| 7 | `pull-comms` | notices, notifications, ptms, messages, documents, leaves, calendarEvents, certificates, settings | watermark |
| 8 | `reconcile` | second `push-outbox` for writes made during the pull | outbox cursor |
| 9 | `conflicts` | detect + queue conflicts, set `sync_state='conflict'` | — |
| 10 | `finalize` | prune pushed outbox rows (7 days), compact DB, write `last_sync_at` | — |

Each step: `status='running'` + cursor → work in pages/batches → success `status='done'` + new
cursor. If the connection drops, only that step stays `running`; the next run restarts **that step
from its cursor**, never the plan from the top. Backoff 1s → 2s → 4s → 8s → 30s, then `failed` and
wait for the next trigger (manual, reconnect, app start, every N minutes idle).

### 6.2 Push (idempotent by construction)

- Ops are collapsed per document (only the latest pending op per doc is sent, with the union of its
  patches) — fewer writes, same outcome.
- One Firestore `writeBatch` per batch (client limit 450; keep 400 for headroom).
- Each pushed doc carries `lastOpId` + `lamport`; an op whose `lamport <= doc.lamport` is skipped,
  so replaying a batch after a dropped connection is safe. No server function needed.

### 6.3 "Transactional" — what's honestly achievable

The Firestore **web SDK has no multi-document transactions**, and the project rule forbids Cloud
Functions, so a true ACID transaction across documents is not available. What we build instead:
ordered steps + durable per-step checkpoints + idempotent re-runs + per-document lamport
monotonicity. The practical guarantee is "the plan converges to a consistent state from wherever it
stopped". If true atomicity is ever required, the only route is a Cloud Function (a rules
exception to decide on, not now).

### 6.4 Pull (permission-aware)

Per collection: `where('updatedAt','>', watermark).orderBy('updatedAt').limit(page)`, watermark
advanced after each page. Single-field ordering → Firestore auto-index, **no new composite index**.

**Crucially, not every collection can be `list()`ed.** Firestore evaluates Security Rules *per
document*, so any rule that inspects `resource.data` (`userId == auth.uid`, `inThread()`,
`studentId in myChildIds()`) rejects a plain `list()` outright — the engine cannot prove the query
is safe. `src/lib/sync/pullPlan.ts` therefore declares, per role, how each collection may be read:

| Strategy | Meaning | Example |
|---|---|---|
| plain | role-only rule, `list()` is provably fine | `classes`, `timetable`, `ptms` |
| filtered | query carries the rule's own predicate | `notifications where userId == uid`; `users where status == 'active'` (teacher); `templates where kind == 'receipt'` (accountant); `invoices where studentId in childIds` (parent) |
| per-parent | fan out one filtered query per parent doc | `marks` per **published** exam (the rule does a `get()` on the parent exam) |
| skip | readable one record at a time, not listable | fee collections for teachers, `certificates` for staff |

`messages` is special: `threadId.split('_')` contains the uid, which no filter can reproduce. We
learn the user's thread ids from the messages they sent, then pull each thread explicitly — so a
parent gets both sides of their own thread and never anyone else's.

One denied collection is recorded and skipped, never fatal to the step (the step detail names it).

Each pulled doc is applied through the same choke point with `origin='remote'`:

- no local dirty change on that doc → straight apply, `dirty=0`
- local dirty but disjoint fields → auto-merge, both sides kept in changelog
- same field edited on both sides → conflict (below)

First run on an empty DB is a full pull of every collection (the "restore from server" path) with a
progress bar and per-collection counts.

### 6.5 Conflict policy

1. **Auto-merge** when locally- and remotely-edited fields are disjoint.
2. **Per-field LWW** when both sides touched the same field and one is strictly newer by
   `(lamport, device_id)` — deterministic, so all replicas converge on the same winner.
3. **Manual queue** when ambiguous, or when the field is structural (`sections`, `slots`, `bands`,
   `childIds`, `perClass`, `elements`) — arrays/objects are compared and chosen whole, never
   spliced.
4. Deleted-vs-edited → deletion wins unless the edit came after the tombstone, then it's a conflict.
5. Resolving writes a compensating op, so a resolution is itself revertible and syncs to others.

---

## 7. Reset with OTP

Two actions, each gated by a code generated locally (`crypto.getRandomValues`, never transmitted)
and shown in the dialog:

- **Reset local data only** — wipe SQLite, optionally reseed from the newest backup, clear
  outbox/changelog/conflicts. No server effect.
- **Reset local + server data** — the above **plus** hard delete of every document in the listed
  collections on Firestore.

Dialog shows: the collections + document counts that will be destroyed, a code like
`K7-4Q2-MX` that must be typed exactly (expires in 5 min, single use), and the word `RESET` typed
too. Reset runs as its own sync-plan step with checkpoints, so a dropped connection resumes it
rather than leaving a half-wiped database.

The server half needs a rules change because the rules deny `delete` everywhere
(`allow delete: if false` — deliberate). Proposal: an admin-writable, time-boxed grant document.

```rules
match /resetGrants/{id} {
  allow create: if isAdmin();
  allow read:   if isAdmin();
}
// and, per collection covered by reset:
function liveResetGrant() {
  return exists(/databases/$(database)/documents/resetGrants/$(request.auth.uid))
      && get(/databases/$(database)/documents/resetGrants/$(request.auth.uid)).data.expiresAt > request.time;
}
allow delete: if isAdmin() && liveResetGrant();
```

The app writes the grant (10 min), performs the deletes, then removes it. Alternative: admins run
the existing `pnpm db:reset` CLI — zero rules change but not available to non-technical staff.
**Open question.**

---

## 8. Backups (keep last 5)

- **Automatic:** `pre-sync` (plan step 1), `daily` when the DB changed, plus `pre-restore` and
  `pre-reset`.
- **Manual:** "Back up now" in Settings.
- Stored as serialized SQLite files in the browser's origin-private storage (OPFS when available,
  IndexedDB fallback), with `sha256`, byte size and doc counts in the `backups` table.
- **Rotation:** newest 5 kept, older deleted, never silently overwritten. Individual backups can
  also be deleted, or exported to disk as a download.
- **Restore:** copy current state to `pre-restore` first (so a restore is undoable) → replace local
  DB → mark restored rows `dirty` with restored lamports → next sync pushes them. "Restore server
  from backup" is a separate, explicitly confirmed action (writes docs as updates; it cannot
  un-delete server docs, which only ever soft-deleted).

---

## 9. Change history + revert

- Every local write, push and pull appends to `changelog` with before/after JSON, actor, origin
  (`local | remote | system`) and device.
- History UI: filter by collection / actor / device / date, field-level diff, **Revert** on any row.
- Revert appends a new op built from `before`, marks the original with `reverted_by`, pushes
  normally — so reverting is revertible and syncs like any other change.
- Retention: 30 days or 50k rows (configurable); pruned rows remain recoverable from backups.

---

## 10. Settings module additions

| Tab | Contents |
|---|---|
| **Sync** | Left column: online/offline badge, local DB readiness + storage + schema + device, counters (docs / waiting to push / conflicts / last sync), Sync now · Push only · Pull only · Reset plan state, then the 10-step plan with per-step status, note and "Retry". Right column, two tables: **(1) Changed here, not on the server yet** — every queued outbox row with record label, change type, touched fields, waiting time and a failure hint; actions: **Push now** (header + bulk) and per-row **Discard** (drops the local edit and lets the next pull re-fetch the server copy), plus search, column picker and CSV export. **(2) Synced last time** — one row per run: when, mode, duration, result, pushed/pulled/conflicts and notes; actions: **Steps** (per-step breakdown of that run), **Re-run** (re-runs only that run's failing step, or its push step), bulk re-run, CSV export, Clear history. |
| **Conflicts** | side-by-side local vs remote per field, keep mine / keep theirs / edit, batch resolve, jump to record |
| **Backups** | list (reason, time, size, docs), back up now, restore, export to disk, delete |
| **History** | changelog with diffs, revert, filters |
| **Storage** | DB size/path, compaction, integrity check, retention settings, reset local / reset local + server (OTP-gated) |

Also a global "Sync pending / conflicts" badge in the sidebar so divergence is never silent.

---

## 11. Firebase CLI work required

1. `pnpm rules:deploy` after adding `resetGrants` + the time-boxed delete window (if that option is
   chosen).
2. **No new composite indexes**: pull queries order by a single field (`updatedAt`), which Firestore
   auto-indexes. Local filtering by collection happens in SQLite, not Firestore.
3. `pnpm emulators` + extended `pnpm rules:test`: reset-grant expiry, non-admin delete denial.
4. `pnpm db:seed` / `pnpm db:reset` remain the CLI escape hatches.
5. Optional: App Check — largely cosmetic for a web app on desktop browsers; recommend skipping.

---

## 12. Phase 1 build order

| Step | Deliverable | Est. | State |
|---|---|---|---|
| 1.1 | SQLite layer + schema/migrations + `LocalProvider` behind `DataProvider`; demo mode parity | 3–4 d | **done** (`src/lib/sync/sqlite.ts`, `localProvider.ts`, `src/lib/data/index.ts` dispatcher) |
| 1.2 | Write choke point: docs + outbox + changelog in one transaction | 2–3 d | **done** (`writeOnce` in `localProvider.ts`) |
| 1.3 | SyncEngine: plan/checkpoints/retry, push, pull, preflight + backups | 3–4 d | **done** (`syncEngine.ts`) |
| 1.4 | Conflict detection (merge / LWW / queue) + resolution UI | 2–3 d | **done** (`conflicts.ts`, `conflictsStore.ts`, `ConflictsTab.tsx`) |
| 1.5 | Settings tabs: Sync, Storage (OTP resets), Backups, History | 3–4 d | **done** (5 new tabs) |
| 1.6 | Scheduling (app start, reconnect, idle interval), offline session cache | 2 d | **done** (`lifecycle.ts`); first-run wizard not built |
| 1.7 | Tests | 2–3 d | **done** — `pnpm test:sync` (17 checks, real SQLite + fake remote) |

Roughly 3 weeks focused; critical path was 1.2 → 1.3. Shipped in this order.

### How it is wired

- `src/lib/data/index.ts` exports a **dispatcher**: every `dataProvider` call awaits
  `bootLocalLayer()` then goes to SQLite. The `DataProvider` interface is unchanged, so no feature,
  hook or existing test had to change.
- `src/lib/sync/lifecycle.ts` triggers a sync on app start, on the browser `online` event and every
  5 minutes while the tab is visible.
- Sidebar shows a divergence badge on Settings (pending pushes, or `!` for conflicts).

### Tests

`pnpm test` runs the fast in-memory suites (60 checks). `pnpm test:sync` additionally boots a **real
SQLite database** (sql.js in Node) against a fake remote (83 checks) covering: provider semantics,
the one-transaction write path, outbox collapse, idempotent push + replay, watermark pull,
auto-merge, conflict queueing + resolution, LWW/tie-break/delete-vs-edit policy, tombstones,
per-step retry with cursor resume, offline behaviour, backup rotation + restore, changelog revert,
OTP reset, server-profile adoption, the permission-aware pull plan, one-denied-collection
tolerance, thread-scoped message pull, the pending queue (list/push/discard) and run history.

### Crash safety

`src/app/ErrorPage.tsx` is wired as the router `errorElement`, so a render crash shows a real page
("This page could not load" + Try again / Dashboard) instead of React's dev overlay. Because data
lives in SQLite, a crash never loses work — the local snapshot is already flushed.

### Known follow-ups

- Offline **sign-in** still needs the network (cached session only keeps the app usable, not a new
  login) — a first-run wizard to pre-cache a session is not built yet.
- Full-pull progress UI shows counts, not per-collection byte progress.
- `settings` and `users` are excluded from server reset on purpose (they would lock admins out).

Phase 2 (.NET app) reuses: this SQLite schema, the outbox/changelog/conflict formats, the lamport
LWW rules, the sync plan and its checkpoints. It does **not** reuse the React UI.

---

## 13. Risks

- **Offline auth**: Firebase Auth cannot sign in without network. Offline we trust a *cached*
  session (uid + role + capabilities in `meta`). Pushing needs a valid token; if the refresh token
  expired (30 days default) the user signs in online once. Offline writes are queued, not blocked.
- **Full-pull cost**: first sync on a large school is many reads → paging + progress + resumability,
  plus a per-module sync scope option.
- **Whole-file DB saves** (option A): fine to a few MB; above that, move to OPFS VFS (option B).
- **1 MiB doc limit**: unchanged; backups chunk per document, never per table.
- **Tab concurrency**: two tabs of the same origin writing the same DB. Mitigation: `navigator.locks`
  around write transactions + a "second tab is read-only / please close" hint.
- **Silent divergence**: auto-merge can produce nonsense nobody notices after two devices diverge
  for a week. Mitigation: loud conflict badge + every auto-merge logged in History.
- **Sync must not run during exam/fees bulk operations**: mutations during a sync are handled by the
  `reconcile` step, but long bulk jobs should disable auto-sync.

---

## 14. Open questions — answered

1. **Storage engine** — `sql.js` + debounced whole-file persistence. **Accepted.**
2. **Server reset** — time-boxed rules grant (`resetGrants/{uid}`, deployed via `pnpm rules:deploy`).
   **Accepted.**
3. **Offline writes** — queued, never blocked (default).
4. **Conflict default** — LWW auto-resolve with a manual queue (default).
5. **Multi-device** — supported by design (lamport + device tie-break); not load-tested yet.
6. **Retention** — last 5 backups, 30-day / 50k-row change log (defaults in `syncEngine.ts`).