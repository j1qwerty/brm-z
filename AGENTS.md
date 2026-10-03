# AGENTS.md - BRM School Management

Working agreement and progress log for coding agents (human or AI) touching this repo.

## Project summary

BMRC is a complete Indian school management system (Nursery to Class 12, April-March academic
sessions) built as a **frontend-only Firebase app**: Vite + React 19 + TypeScript (strict),
Tailwind CSS v4 with CSS-first OKLCH themes, Firebase (Auth + Firestore) via the client SDK,
and TanStack Table/Query on top of a swappable data-provider layer. There is **no backend
server**. Local Node scripts (firebase-admin) exist only for seeding and admin tasks.
Netlify hosts the static build; Firestore Security Rules are the authorization layer.

## Hard rules (never violate)

1. **pnpm only.** Every command in docs, scripts and CI is a pnpm command.
2. **No backend server.** Firebase client SDK + local admin scripts only. If a job seems to
   need a server, stop and ask the owner.
3. **Soft delete everywhere.** Deletions set `deletedAt`/`deletedBy`; all queries filter them.
   Restore happens via the Trash module. No permanent-delete UI or rule allows `delete`.
4. **Security is server-side.** `firestore.rules` enforces the role matrix. The UI only hides
   what rules already prevent.
5. **Tailwind v4 CSS-first themes.** OKLCH tokens, semantic names only, no hardcoded hex in
   components. Dark theme is dark *gray*, never pure black.
6. **One DataTable.** All tables use `src/components/shared/DataTable.tsx`. Do not fork it.
7. **Tabs, not scattered pages.** Modules group sub-features into deep-linkable tabs
   (`/fees?tab=payments`).
8. **Helpers everywhere.** Every module has an InfoTip, a first-visit tour, helpful empty
   states and inline validation.
9. **TypeScript strict.** Zod schemas shared between forms, mappers and types.
10. **html2canvas-pro, never html2canvas** (Tailwind v4 OKLCH colors break the original).
11. **Local-first.** All reads/writes go through `src/lib/data/index.ts` → SQLite (`src/lib/sync/`); never call Firestore directly from a feature. Mutations funnel through `localProvider.writeLocal` (doc + outbox + changelog in ONE transaction). Never ship a service-account key to the browser.
12. **The desktop shell stays a shell.** `electron/main.ts` owns windows, menus, tray and disk I/O; `electron/preload.ts` is the *only* bridge. Renderer code reaches the shell through `src/lib/desktop.ts`, which must no-op in the browser. Never enable `nodeIntegration`, never import `electron` from `src/`.
13. **One icon source.** `public/favicon.svg` is the truth; `pnpm icons` derives `build/icon.ico`, `build/icon.png` and `build/tray.png`. Never hand-draw a second icon.

## Commands (pnpm)

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server with hot reload (port 5121, strictPort) |
| `pnpm build` | `tsc -b` + production bundle to `dist/` (relative `base`, for `file://`) |
| `pnpm preview` | Serve the production build locally |
| `pnpm icons` | Rasterise `public/favicon.svg` → `build/icon.{ico,png}` + `build/tray.png` |
| `pnpm electron:build` | esbuild-bundle `electron/main.ts` + `preload.ts` to `dist-electron/*.cjs` |
| `pnpm electron:dev` | Electron + Vite together, hot reload, devtools |
| `pnpm electron:start` | Electron against the production build |
| `pnpm electron:dist` | electron-builder → Windows NSIS installer in `release/` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm typecheck` | `tsc --noEmit` strict pass |
| `pnpm test` | Run all in-memory CRUD suites (sessions, classes, subjects, students, staff, teachers, templates, users, generation, integration). Prints pass/fail summary, exits 1 on failure. Pure in-memory, no Firebase/DOM needed. |
| `pnpm test:sync` | Offline-first suite on a REAL SQLite DB (sql.js in Node) + fake remote: one-transaction writes, outbox, idempotent push, watermark pull, auto-merge + conflict queue, LWW policy, step retry/resume, backups, revert, OTP reset. |
| `pnpm test:live` | Real Firestore test, ~66 checks, all ids prefixed `tst-` (see `pnpm test-reset`) |
| `pnpm db:seed` | Seed the real Firebase project with demo school data (needs service account) |
| `pnpm db:reset` | Wipe all collections (interactive confirm) |
| `pnpm users:create` | Create Auth user + users doc: `--email --password --name --role` |
| `pnpm users:promote` | Change role/status: `--email --role` or `--status` |
| `pnpm emulators` | Start Auth + Firestore emulators with import/export |
| `pnpm rules:deploy` | Deploy `firestore.rules` + `firestore.indexes.json` |
| `pnpm rules:test` | Smoke-test rules against the running emulator |
| `pnpm fb:login` | Firebase CLI login |
| `pnpm netlify:login` | Netlify CLI login |
| `pnpm netlify:init` | Link/create the Netlify site |
| `pnpm netlify:env` | Set env vars: `pnpm netlify:env -- VITE_FIREBASE_API_KEY <value>` |
| `pnpm deploy:preview` | Build + deploy a draft preview to Netlify |
| `pnpm deploy` | Build + deploy production to Netlify |

## Data flow (must-know)

```
feature/UI → hooks → src/lib/data/index.ts (dispatcher) → src/lib/sync/localProvider.ts → SQLite
                    ↑ doc row + outbox row + changelog row written in ONE transaction
      src/lib/sync/syncEngine.ts (10 checkpointed steps) ⇄ Firestore (signed-in user session)
```

- Reads never touch the network; sync is background, idempotent and resumable (`sync_state` cursors).
- Features must NOT import `firestoreProvider` or call Firestore directly — go through the hooks.
- Conflict policy, backups, history, OTP resets and the phase plan live in `sync.md`.

## CLI-first setup protocol

Attempt every setup step with the CLI first. When a step **cannot** be done via CLI (Firebase
Auth provider enablement, Firestore creation on some plans), print the exact console click-path
and ask the owner to confirm before moving on. Never silently skip a step.

### Firebase setup

1. `pnpm fb:login`
2. Create/select the project: `firebase projects:create bmrc-school` then `firebase use --add`
3. **MANUAL (console, CLI cannot do this):**
   - Authentication → Sign-in method → enable **Google** and **Email/Password**
   - Authentication → Settings → Authorized domains → add your Netlify domain
   - Firestore Database → Create database (production mode)
4. `pnpm rules:deploy` (rules + indexes)
5. **MANUAL:** Project settings → Service accounts → Generate new private key → save as
   `scripts/service-account.json` (gitignored, never commit) and set `SERVICE_ACCOUNT_PATH`
   + `FIREBASE_PROJECT_ID` in `.env.local`
6. `pnpm db:seed` (demo school) and/or `pnpm users:create` for the first admin
7. Copy `.env.example` → `.env.local`, fill the six `VITE_FIREBASE_*` values from
   Project settings → General → Your apps

### Netlify setup

1. `pnpm netlify:login`
2. `pnpm netlify:init` (link or create the site; publish dir `dist`, build `pnpm build`)
   - **MANUAL (if CLI site creation is unavailable):** push to GitHub → Netlify UI →
     "Import from Git" → pick the repo → build command `pnpm build`, publish `dist`
3. Set env vars: `pnpm netlify:env -- VITE_FIREBASE_API_KEY <value>` (repeat for all six)
4. `pnpm deploy` (production) or `pnpm deploy:preview` (draft URL)

## Deployment order

1. Firebase: project → Auth providers → Firestore → rules → seed/users
2. `.env.local` with all six VITE_ vars (and admin script vars)
3. Verify locally: `pnpm dev` (sign in, approve, dashboard)
4. Netlify: link site → env vars → `pnpm deploy`
5. Re-check Firebase authorized domains includes the Netlify domain

## Troubleshooting

- **PDFs render black/blank:** you swapped html2canvas-pro for html2canvas. Undo - OKLCH
  colors are unsupported by the original.
- **Firestore index errors in console:** the error links to a one-click index builder; after
  adding indexes locally also append them to `firestore.indexes.json`, then `pnpm rules:deploy`.
- **`auth/unauthorized-domain`:** add the current domain in Firebase console → Authentication →
  Settings → Authorized domains.
- **Google popup closes instantly:** the domain is not authorized, or popups are blocked.
- **Sign-up stuck on "pending":** expected. Approve via User Accounts (admin) or
  `pnpm users:promote -- --email <email> --status active`.
- **"Demo mode" banner:** no Firebase env vars found; add `.env.local` and restart `pnpm dev`.
- **Desktop blank page / `ERR_FILE_NOT_FOUND`:** the shell loaded `dist/` over `file://`.
  Run `pnpm build` before `pnpm electron:start`/`dist`.
- **Desktop CSP blocks WebAssembly:** `script-src` must keep `'wasm-unsafe-eval'`
  (sql.js), never `'unsafe-eval'`. Inline scripts in `dist/index.html` are hashed
  automatically by `csp()` in `electron/main.ts`.
- **Blank tray icon:** `pnpm icons` regenerates `build/tray.png`, which
  `electron:build` copies into `dist-electron/` and electron-builder ships as an
  `extraResources` entry.

## Architecture map

```
src/
  app/            providers, router, guards, AppShell (sidebar/topbar/palette), nav matrix
  lib/
    firebase.ts   env detection + SDK init (demo mode when env missing)
    auth.tsx      AuthProvider: Firebase auth or demo accounts, pending-approval flow
    data/         provider interface, firestore + localStorage impls, TanStack hooks, demo seed
    types.ts      all Firestore doc shapes (timestamps = epoch millis)
    permissions.ts  role capability matrix (mirrors firestore.rules)
    generate-on-open.ts  idempotent scheduler (invoices, notice flip, exam transitions)
    pdf.ts qr.ts csv helpers, notify.ts (in-app notifications)
    desktop.ts    renderer-safe bridge to the Electron shell (no-ops in browser)
    desktopSync.ts  menu/tray command handling + window title
  sync/          src/lib/sync: SQLite, sync engine, pull plan, queue, conflicts, backups
  components/
    ui/           shadcn-style primitives (Radix)
    shared/       DataTable, TabbedModule, PageHeader+InfoTip, EmptyState, ImageUrlField, tours
  features/       one folder per module; tabs live inside each module page
electron/         main.ts (window/menu/tray/disk) + preload.ts (contextBridge API)
scripts/          firebase-admin CLIs, test runners, electron-build.mjs, make-icons.mjs
build/            generated icons (tracked): icon.ico, icon.png, tray.png, icon.svg
firestore.rules   server-side authorization (the real access control)
```

## Phase progress log

| Phase | Scope | Status |
| --- | --- | --- |
| P1 | Scaffold, themes, app shell, shared components, tours | Done |
| P2 | Firebase + auth + users module + rules v1 + settings + scripts | Done |
| P3 | Sessions (+promotion wizard), classes/subjects, assignment matrix | Done |
| P4 | People (students/teachers/staff/parents), profiles, CSV, documents | Done |
| P5 | Attendance (mark/reports/staff), leaves, timetable with conflict detection | Done |
| P6 | Fees: 6 tabs, idempotent generation, partial payments, receipts | Done |
| P7 | Exams, marks entry, publish gating, report cards, certificates, template designers | Done |
| P8 | Notices, notifications, PTM, messaging, parent/student portals | Done |
| P9 | Dashboards + charts, bulk contacts, trash, generate-on-open, docs | Done |
| D1 | Offline-first SQLite + resumable sync + conflicts/backups/history/OTP reset | Done |
| D2 | Electron desktop shell: native menus, tray, disk-backed DB, icons, CSP, packaging | Done |

Build verification at ship time: `pnpm lint && pnpm typecheck && pnpm build` - all clean.
Desktop changes additionally need `pnpm electron:build`, a `pnpm electron:start` smoke
test (file:// + CSP + WASM), and `pnpm test` + `pnpm test:sync` still green.
