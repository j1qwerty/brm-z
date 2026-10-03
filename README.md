# BRM School Management

A complete school management system for Indian schools (Nursery to Class 12), built for the
April-March academic session. Frontend-only Firebase app: no backend server, no Firebase
Storage, no Cloud Functions - Firestore Security Rules are the authorization layer, all PDFs
are generated in the browser.

## Feature list

- **Auth & onboarding**: Google + email/password sign-in, signup-to-approval flow, role-based
  routing; first admin created via CLI.
- **Dashboard**: role-specific (admin KPIs + charts, teacher day view, portals for everyone else).
- **Sessions**: CRUD, one active session, promotion wizard with dry-run preview, per-student
  hold-back, top-class graduation.
- **Classes & Subjects**: sections, class teacher, percentage-vs-grade mode per subject,
  teacher-class-subject assignment matrix.
- **People**: students, teachers, non-teaching staff, parents. Rich profiles with attendance /
  fees / marks / documents / leaves sub-tabs. CSV import (template + row-level error report)
  and export. Parent-child linking (multi-child switcher). Photo via validated external URL.
- **Attendance**: class-section daily register (default present, one-tap), staff attendance,
  month/term reports with 75% defaulter highlighting, CSV export.
- **Leaves**: apply (staff/students/parents), approve/reject with note, history.
- **Timetable**: per class-section weekly grid, teacher double-booking detection, teacher and
  class views, print/PDF.
- **Fees**: fee types with frequencies → class/student assignments → idempotent period
  invoice generation (run-once-per-period, deterministic ids, never duplicates) → partial or
  full payments with auto receipt numbers → collection reports, defaulter list, CSV.
- **Exams & results**: per-class subject configs, assigned-teacher-only marks entry, automatic
  CBSE grading, publish toggle (students/parents see nothing before publish), per-exam and
  cumulative final report cards (PDF, with remarks).
- **Certificates**: Transfer (auto serial), Bonafide, Character - live preview → PDF, issued
  registry.
- **Templates**: visual drag-and-drop designers (dnd-kit layers + react-moveable handles) for
  ID cards (student/teacher/staff), receipts, report cards, certificates. Logo, background and
  one extra image slot, QR elements, one default per kind, bulk class ID-card PDFs.
- **Notices & notifications**: audience targeting (all/roles/classes), scheduled publishing,
  pinned board, notification bell with unread badge and deep links.
- **PTM**: teacher-created slots, parent booking per child, calendar integration.
- **Messaging**: simple parent ↔ class-teacher threads, one per child.
- **Portals**: parent portal with child switcher (attendance, published marks, fees, receipts,
  timetable, notices, PTM booking, leave apply); student portal (read-only self view).
- **Calendar**: month view merging manual events + auto exam/PTM entries.
- **Trash**: unified soft-deleted records with restore. Nothing is ever permanently deleted.
- **Bulk contacts**: manual-mode communication lists with WhatsApp click-to-chat links and
  mailto export (no paid SMS providers).
- **4 themes**: Light, Dark (dark gray, never black), Paper (warm sepia), Ocean (cool blue) -
  switchable live, persisted, no flash on load. Add your own in ~15 lines of CSS.
- **Helpers everywhere**: InfoTip on every module, first-visit tours (driver.js), skeleton
  loading, empty states with CTAs, inline validation, toasts.

## Tech stack

Vite 7 · React 19 · TypeScript (strict) · Tailwind CSS v4 (CSS-first, OKLCH) · shadcn-style
Radix primitives · TanStack Table v8 + TanStack Query v5 · zustand · react-router v7 ·
react-hook-form + zod 4 · dnd-kit + react-moveable · jspdf + html2canvas-pro · qrcode ·
recharts · driver.js · sonner · cmdk · date-fns · Firebase 12 (Auth + Firestore client SDK) ·
firebase-admin + tsx + dotenv (local scripts only).

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` or `npm i -g pnpm`)

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Dev server (works instantly in **demo mode**, no Firebase needed) |
| `pnpm build` | Type-check + production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm icons` | Regenerate the app/installer/tray icons from `public/favicon.svg` |
| `pnpm electron:dev` | Run the **desktop app** (Electron) with hot reload: Vite + Electron together |
| `pnpm electron:start` | Run the desktop app against the **production** build (no hot reload) |
| `pnpm electron:dist` | Package a Windows installer (NSIS) into `release/` |
| `pnpm electron:dist:dir` | Unpacked Windows build in `release/` (faster, for testing) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Strict TypeScript check |
| `pnpm test` | run tests (fast, in-memory — no Firebase, no network) |
| `pnpm test:sync` | offline-first/sync suite on a REAL SQLite database (sql.js in Node) + fake remote: outbox, pull, conflicts, checkpoints, backups, revert, OTP reset |
| `pnpm test:live` | REAL tests against real Firestore: 2 sessions, Classes 1-10 (A+B), 60 students, parents, attendance, timetable, fees, exams/marks — all ids prefixed `tst-` (needs service account key) |
| `pnpm test-reset` | Delete ONLY `tst-` test docs from real Firestore (real school data untouched) |
| `pnpm db:seed` | Seed real Firebase with demo school data (needs service account key) |
| `pnpm db:reset` | Wipe all collections (asks you to type DELETE) |
| `pnpm users:create` | Create a user + role directly: `-- --email a@b.in --password x --name "Name" --role admin` |
| `pnpm users:promote` | Change role/status: `-- --email a@b.in --role admin` or `--status active` |
| `pnpm emulators` | Firestore + Auth emulators (import/export to `./firebase-data`) |
| `pnpm rules:deploy` | Deploy security rules + indexes |
| `pnpm rules:test` | Smoke-test rules against the local emulator |
| `pnpm fb:login` | Firebase CLI login |
| `pnpm netlify:login` | Netlify CLI login |
| `pnpm netlify:init` | Link/create the Netlify site |
| `pnpm netlify:env` | `pnpm netlify:env -- VAR value` (repeat per var) |
| `pnpm deploy:preview` | Build + draft deploy to Netlify |
| `pnpm deploy` | Build + production deploy to Netlify |

## Quick start (demo mode)

```bash
pnpm install
pnpm dev
```

No Firebase config? The app boots in **demo mode** with a full seeded school (classes,
students, fees, exams, attendance, notices) stored in your browser. Use the one-tap demo
accounts on the login screen (Admin, Teacher, Accountant, Staff, Student, Parent). Everything
works offline; a banner reminds you it is local-only.

## Firebase setup (step by step)

1. `pnpm fb:login` and create/select your project:
   `firebase projects:create bmrc-school` → `firebase use --add`
2. **Console steps (CLI cannot do these):**
   - Authentication → Sign-in method → enable **Google** and **Email/Password**
   - Firestore Database → Create database (production mode)
   - Authentication → Settings → Authorized domains → add `localhost` and your Netlify domain
3. Copy `.env.example` → `.env.local` and fill the six `VITE_FIREBASE_*` values
   (Project settings → General → Your apps → Web app config). Keep
   `VITE_APP_ENV=development` locally; set it to `production` for the live
   site (production enforces exactly one active session, development allows
   several for testing).
4. `pnpm rules:deploy` - deploys `firestore.rules` and `firestore.indexes.json`.
5. **Service account key** (for the local scripts): Project settings → Service accounts →
   Generate new private key → save as `scripts/service-account.json` (already gitignored).
   Set in `.env.local`: `SERVICE_ACCOUNT_PATH=./scripts/service-account.json` and
   `FIREBASE_PROJECT_ID=<your-project-id>`.
6. `pnpm db:seed` - creates the demo school + these logins:

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@bmrc.demo | Bmrc@2026 |
| Teacher | teacher@bmrc.demo | Bmrc@2026 |
| Accountant | accountant@bmrc.demo | Bmrc@2026 |
| Staff | staff@bmrc.demo | Bmrc@2026 |
| Parent | parent@bmrc.demo | Bmrc@2026 |

   (Parents sign up themselves in real usage; this seeded parent is pre-linked to two children
   for testing.) Prefer real emails? `pnpm users:create -- --email you@school.in --password "Strong!" --name "Your Name" --role admin`.
7. `pnpm dev` - the demo banner disappears once Firebase env vars are detected.

## Offline-first sync

The app is **local-first**: every read and write goes to a local SQLite database (`sql.js`,
persisted in this browser), so it works with no network. Changes are queued in an outbox and pushed
to Firestore by a sync plan of 10 checkpointed steps — if the connection drops, the plan resumes at
the failed step only. See `sync.md` for the full design.

- **Settings** gained five tabs: **Sync** (status, the 10-step plan with per-step retry, plus two
  tables: everything changed here that is not on the server yet — with Push now / Discard — and what
  the last runs actually synced, with per-step breakdowns and Re-run), **Conflicts** (side-by-side
  mine vs server), **Backups** (last 5, restore any, export), **History** (every change with a diff
  + revert) and **Storage & reset**.
- **Permission-aware sync**: Firestore rules are evaluated per document, so collections like
  notifications, messages and invoices cannot be listed without a matching filter. The pull plan
  (`src/lib/sync/pullPlan.ts`) picks a safe read strategy per collection *and per role*, and a
  collection your role may not list is reported and skipped instead of failing the sync.
- **Conflicts**: disjoint edits merge automatically, same-field edits resolve by logical clock
  (lamport, tie-broken on device id), and structural fields (sections, slots, bands, child links)
  are parked for a human decision instead of being guessed.
- **Reset** is deliberately awkward: a random code is generated on your device, shown in the dialog,
  and must be typed (plus the word `RESET`). Server reset additionally requires a time-boxed admin
  grant — `users` and `settings` are never deleted so you cannot lock yourself out.

## Desktop app (Electron)

The same app ships as a Windows desktop application: a real native shell around the
production build, not a separate codebase.

```bash
pnpm electron:dev      # dev: Vite + Electron, hot reload, devtools open
pnpm electron:start    # production build inside the shell
pnpm electron:dist     # -> release/BRM-School-Setup-1.0.0.exe
```

**What the shell adds**

- **Native menus** with the school's actual vocabulary: File (New Admission, Mark
  Attendance, Collect Fee, Back Up Now, Back Up and Export, Print), Edit, View,
  **Sync** (Sync Now, Push only, Pull only, Retry failed step, Conflicts, History),
  Window and Help. Every sync-related item drives the app's own sync engine.
- **System tray** (non-macOS) with Open / Sync Now / Sync Status / Back Up / Quit.
  Closing the window hides to the tray; quitting is explicit.
- **The database is a real file**: `%APPDATA%\bmrc-school-management\data\bmrc-local.sqlite`,
  written atomically by the main process after every debounced save. Backups are
  individual `.sqlite` files in `%APPDATA%\bmrc-school-management\backups\`, so they can be
  copied to a pen drive. Both folders are one click away in **Settings → Sync** and
  in the app menu.
- **Remembered window** size/position, single-instance lock, external links open in
  the real browser, renderer console + crashed-renderer logs in the terminal.
- **Themed native chrome**: first launch is light; switching to dark in-app updates
  the window chrome too.

**How it stays secure**: `contextIsolation` on, `nodeIntegration` off, a `contextBridge`
API (`electron/preload.ts`) as the only surface, and a Content-Security-Policy on the
packaged build that hashes the inline theme script and allows WebAssembly (sql.js)
via `'wasm-unsafe-eval'` rather than `'unsafe-eval'`.

**Notes for the packaged build**: routing switches to hash history automatically,
because the app is loaded over `file://` where path-based URLs cannot be resolved;
Vite's `base` is relative for the same reason. `BMRC_DESKTOP_DIST=1 electron .` runs the
built app without packaging, which is the quickest way to reproduce an installer bug.

### Roles & what each can see

| Data | admin | teacher | accountant | staff | student | parent |
| --- | --- | --- | --- | --- | --- | --- |
| Users & roles | yes | - | - | - | - | - |
| Sessions/classes/subjects | manage | read own | - | read | read own | read child's |
| Students/staff records | manage | read own class | basic read | read | own | children |
| Attendance entry | yes | own class + self | - | self | own | children |
| Fees (all tabs) | yes | - | yes | - | own | children |
| Exams / marks entry | yes | own subjects | - | - | published own | published children |
| Notices | create | create | - | - | read targeted | read targeted |
| Timetable | edit | read/edit assigned | - | read | own | children |
| Templates | yes | - | receipt read | - | - | - |
| PTM | create | create own | - | - | view | book/view |
| Leaves | approve | approve own class | - | apply | apply | child apply |
| Settings / Trash / Calendar mgmt | yes | - | - | - | - | - |

These rules are enforced twice: in `firestore.rules` (authoritative) and in the UI matrix at
`src/lib/permissions.ts` (hides what is not allowed).

## Netlify deploy

```bash
pnpm netlify:login
pnpm netlify:init          # or: push to GitHub → Netlify UI → "Import from Git"
pnpm netlify:env -- VITE_FIREBASE_API_KEY <value>      # repeat for all six VITE_ vars
pnpm deploy                # or pnpm deploy:preview for a draft URL
```

`netlify.toml` already sets build command `pnpm build` and publish dir `dist`; SPA redirects
ship in `public/_redirects`. After deploying, add the Netlify domain to Firebase →
Authentication → Authorized domains, or Google sign-in will fail there.

Alternative without CLI: push to GitHub, then in Netlify "Add new site → Import an existing
project", set build `pnpm build`, publish `dist`, and add the six env vars in Site settings.

## Emulators & rules testing

```bash
pnpm emulators     # terminal 1 (auth :9099, firestore :8080, UI :4000)
pnpm rules:test    # terminal 2 - anonymous-access smoke test
```

Point the app at emulators by adding to `.env.local`:
`VITE_USE_EMULATORS=true` is not wired by default; to develop against emulators temporarily
edit `src/lib/firebase.ts` per the Firebase docs (`connectAuthEmulator`,
`connectFirestoreEmulator`).

## Testing

Two layers — fast logic tests plus real Firestore tests:

```bash
pnpm test          # 47 in-memory CRUD checks (sessions, classes/subjects, students,
                   # staff, templates, integration). Pure Node, no Firebase, ~60ms.
pnpm test:live     # REAL Firestore test: writes ~200 docs (2 sessions, Classes 1-10
                   # with sections A+B, 4 subjects/class, 8 staff, 60 students,
                   # 12 parents, assignments, fees/invoices/payments, attendance,
                   # leaves, timetable, exams/marks/report cards, templates,
                   # certificates, notices, PTM, messages, calendar) with
                   # create → read → edit → soft-delete → restore checks per module.
pnpm test-reset    # deletes ONLY the live-test docs (every live-test id starts
                   # with `tst-`, so real school data is never touched).
                   # Use `pnpm test-reset -- --yes` to skip the confirmation prompt.
```

Notes:

- `pnpm test` runs in 0-1ms per check because it is an in-memory provider mirroring
  the app's data layer — it catches CRUD/soft-delete logic bugs, not network/rules issues.
- `pnpm test:live` hits the network (expect 30-90s) and needs the same service-account
  setup as `pnpm db:seed` (README step 5). It uses `set(merge)` with fixed `tst-` ids,
  so re-runs are idempotent.
- `pnpm test:live` uses firebase-admin, which bypasses Security Rules (same as seeding).
  Rule enforcement itself is covered by `pnpm rules:test` on the emulator.

## Sessions, environments & data scoping

- The top-bar session switcher drives every session-scoped page: fees (assignments,
  invoices, payments, records), exams, attendance registers and the timetable all
  filter by the selected session, and new records are written with that session id.
  Attendance doc ids include the session, so the same class/date in two sessions
  never overwrites each other.
- `VITE_APP_ENV=production` enforces exactly one active session (activating one
  deactivates the rest). `development` allows several active sessions for testing.
  Any session (active or not) can be soft-deleted from the Sessions page.
- Invoice generation is idempotent and never touches existing invoices: re-running
  (auto on month-open, the one-click button, or the custom dialog for one fee type /
  one class / hand-picked students / any month) only creates missing invoices, so
  collected amounts can never be reset.
- Timetable periods are per class-section: Mon-Fri and Saturday counts are set with
  the steppers above the grid (e.g. 8 vs 6, short Saturdays). Columns past a day's
  count render as "end".
- Notifications fan out automatically: publishing a notice notifies its audience,
  scheduled notices notify on the auto-flip, calendar events notify all active users,
  absence saves notify parents, exam publishes notify everyone, PTM creation notifies
  parents and bookings notify the teacher.
- Google sign-in Gmail binding: users link a Gmail from the complete-profile screen
  (students via the Login Gmail field on their record, set by themselves or the
  class-teacher); admins approve/reject/set linked Gmails in User Accounts.
- Certificates pick their design from Templates (kind `certificate`), with one
  default per certificate type (TC / bonafide / character); the template designer
  opens full-screen.

## Theme customization

Themes live in `src/styles/themes.css` as `[data-theme='name']` blocks of OKLCH tokens.
To add one:

```css
[data-theme='mint'] {
  --bg: oklch(0.97 0.02 160);
  --surface: oklch(0.985 0.015 160);
  --card: oklch(0.995 0.01 160);
  --border: oklch(0.9 0.03 160);
  --foreground: oklch(0.25 0.03 160);
  --muted: oklch(0.95 0.02 160);
  --muted-foreground: oklch(0.5 0.03 160);
  --primary: oklch(0.55 0.11 160);
  --primary-foreground: oklch(0.99 0.01 160);
  --primary-soft: oklch(0.93 0.05 160);
  --ring: oklch(0.6 0.1 160);
  /* copy the remaining tokens (success/warning/danger/chart-1..5/sidebar) from an existing theme */
}
```

Then register it in `src/lib/themes.ts` (`THEMES` array). It appears in the theme switcher
instantly - no other code changes.

## Project structure

See `AGENTS.md` for the full architecture map and the phase progress log.

## Troubleshooting

- **Demo banner says data is local-only:** expected without Firebase env vars.
- **`auth/unauthorized-domain`:** add the current domain to Firebase authorized domains.
- **Index errors in the browser console:** Firebase links a one-click builder; also keep
  `firestore.indexes.json` in sync and `pnpm rules:deploy`.
- **Black PDFs:** you replaced html2canvas-pro with html2canvas - Tailwind v4 OKLCH colors
  break the original library. Keep html2canvas-pro.
- **Signup stuck pending:** ask an admin (or `pnpm users:promote -- --email x --status active`).
- **Desktop app shows a blank page:** the shell loaded `dist/` from `file://`. Run
  `pnpm build` first — stale/missing assets produce `ERR_FILE_NOT_FOUND`.
- **Tray icon is blank:** run `pnpm icons`; `dist-electron/tray.png` is copied from
  `build/tray.png` at build time and ships as an `extraResources` entry.
- **Desktop app: `WebAssembly.instantiate() violates Content Security Policy`:** the CSP
  needs `'wasm-unsafe-eval'` in `script-src` (sql.js). Do not swap it for
  `'unsafe-eval'`.
- **Deep links in the packaged app:** hash history (`#/fees?tab=payments`) is used
  automatically on `file://`. Web builds keep clean paths.

## Security notes

- `.env.local` and `scripts/service-account.json` are gitignored; VITE_ vars are public by
  design (Firebase web keys are identifiers, not secrets - rules do the protecting).
- All authorization is enforced by Firestore Security Rules (`firestore.rules`), default-deny.
- Soft delete only: no rule in the repo allows a hard delete of any document.
- No secrets, no server, no Storage bucket; images are external URLs by design.
