/**
 * Local SQLite schema — SHARED CONTRACT.
 *
 * The .NET desktop app (phase 2) reads the same file with Microsoft.Data.Sqlite,
 * so treat column names and semantics as a public contract: add columns, never
 * rename or repurpose. Bump SCHEMA_VERSION and add a migration step in
 * sqlite.ts when the shape changes.
 */

export const SCHEMA_VERSION = 1

export const DDL = `
CREATE TABLE IF NOT EXISTS docs (
  collection  TEXT NOT NULL,
  id          TEXT NOT NULL,
  data        TEXT NOT NULL,             -- JSON document (epoch-millis timestamps)
  updated_at  INTEGER NOT NULL,          -- document updatedAt (ms)
  local_rev   INTEGER NOT NULL,          -- bumped on every local write
  lamport     INTEGER NOT NULL,          -- logical clock, drives LWW conflict resolution
  device_id   TEXT NOT NULL,
  deleted_at  INTEGER,                   -- tombstone (soft delete propagates like the server)
  dirty       INTEGER NOT NULL DEFAULT 0,-- unsent local change
  sync_state  TEXT NOT NULL DEFAULT 'synced', -- synced | dirty | conflict
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS docs_collection_updated ON docs (collection, updated_at);
CREATE INDEX IF NOT EXISTS docs_dirty             ON docs (collection, dirty);

CREATE TABLE IF NOT EXISTS outbox (
  op_id       TEXT PRIMARY KEY,          -- ULID: idempotency key echoed back as syncOpId
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  op          TEXT NOT NULL,             -- create | update | delete
  patch       TEXT NOT NULL,             -- JSON of changed fields only
  base_rev    INTEGER NOT NULL,
  lamport     INTEGER NOT NULL,
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  pushed_at   INTEGER,                   -- NULL = pending
  step        TEXT                        -- sync step that pushed it
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (pushed_at, collection, created_at);

CREATE TABLE IF NOT EXISTS changelog (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id       TEXT NOT NULL,
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  op          TEXT NOT NULL,
  before      TEXT,                      -- JSON of previous values
  after       TEXT,                      -- JSON of new values
  actor       TEXT,                      -- users doc id
  origin      TEXT NOT NULL,             -- local | remote | system
  device_id   TEXT NOT NULL,
  at          INTEGER NOT NULL,
  reverted_by INTEGER                    -- seq of the change this one reverts
);
CREATE INDEX IF NOT EXISTS changelog_doc ON changelog (collection, doc_id, seq);

CREATE TABLE IF NOT EXISTS conflicts (
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
CREATE INDEX IF NOT EXISTS conflicts_open ON conflicts (resolved_at, collection);

CREATE TABLE IF NOT EXISTS sync_state (
  step        TEXT PRIMARY KEY,          -- plan step id
  status      TEXT NOT NULL,             -- pending | running | done | failed
  cursor      TEXT,                      -- watermark / page cursor for resume
  started_at  INTEGER,
  finished_at INTEGER,
  error       TEXT,
  attempt     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS backups (
  id         TEXT PRIMARY KEY,           -- 20261003T101500Z-manual
  created_at INTEGER NOT NULL,
  reason     TEXT NOT NULL,              -- manual | pre-sync | daily | pre-restore | pre-reset
  path       TEXT NOT NULL,              -- persistence key
  bytes      INTEGER NOT NULL,
  doc_count  INTEGER NOT NULL,
  sha256     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`

/** Sync plan groups. Order matters: dependencies first. Subcollection paths
 *  (`classes/{id}/subjects`) are discovered while running step `pull-sessions`. */
export const PLAN_COLLECTIONS = {
  'pull-sessions': ['sessions', 'classes'],
  'pull-people': ['staff', 'students', 'users'],
  'pull-academics': ['assignments', 'gradingScales', 'templates', 'exams', 'marks'],
  'pull-ops': [
    'attendance', 'timetable', 'timetableConfig',
    'feeTypes', 'feeAssignments', 'invoices', 'payments',
  ],
  'pull-comms': [
    'notices', 'notifications', 'ptms', 'messages', 'documents',
    'leaves', 'calendarEvents', 'certificates',
  ],
} as const

export type PlanStepId =
  | 'preflight'
  | 'push-outbox'
  | 'pull-sessions'
  | 'pull-people'
  | 'pull-academics'
  | 'pull-ops'
  | 'pull-comms'
  | 'reconcile'
  | 'conflicts'
  | 'finalize'

export const PLAN_ORDER: PlanStepId[] = [
  'preflight',
  'push-outbox',
  'pull-sessions',
  'pull-people',
  'pull-academics',
  'pull-ops',
  'pull-comms',
  'reconcile',
  'conflicts',
  'finalize',
]

/**
 * Collections cleared by "reset server data". `users` and `settings` are
 * deliberately excluded: wiping them would lock every admin out and destroy the
 * school profile.
 */
export const RESETTABLE_COLLECTIONS = [
  'sessions', 'classes', 'assignments', 'students', 'staff', 'attendance',
  'feeTypes', 'feeAssignments', 'invoices', 'payments', 'exams', 'marks',
  'gradingScales', 'reportCards', 'templates', 'certificates', 'notices',
  'notifications', 'timetable', 'timetableConfig', 'leaves', 'documents',
  'ptms', 'messages', 'calendarEvents', 'runHistory',
] as const

/** Fields treated as structural: compared whole, never merged field-by-field. */
export const STRUCTURAL_FIELDS = new Set([
  'sections', 'slots', 'bands', 'childIds', 'perClass', 'elements',
  'sessions', 'audience', 'status', 'isActive',
])