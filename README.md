# BMRC School Management

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
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Strict TypeScript check |
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
   (Project settings → General → Your apps → Web app config).
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

## Security notes

- `.env.local` and `scripts/service-account.json` are gitignored; VITE_ vars are public by
  design (Firebase web keys are identifiers, not secrets - rules do the protecting).
- All authorization is enforced by Firestore Security Rules (`firestore.rules`), default-deny.
- Soft delete only: no rule in the repo allows a hard delete of any document.
- No secrets, no server, no Storage bucket; images are external URLs by design.
