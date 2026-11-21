# Alex Clinic Management System

A web system for clinics with multi-specialty doctors, front desk appointment queueing, laboratory test ordering, and an online patient portal for viewing/downloading test results.

---

## Architecture

- **Local Clinic Network (`apps/api` + `apps/staff-web`):**
  - **API:** NestJS (TypeScript), Prisma ORM, PostgreSQL (via Supabase in dev).
  - **Staff Web:** Next.js (App Router), `next-intl` (English & Arabic with full RTL), Tailwind CSS.
  - **Sync:** Secure HMAC-signed background worker pushes completed results to the cloud.
- **Cloud (`apps/portal`):**
  - Patient portal on Vercel backed by the isolated `portal` schema in Supabase PostgreSQL.
  - Holds only portal accounts and completed results (zero clinic operational data).

---

## Phase 0 Foundation Status

- [x] Monorepo workspace configuration (`pnpm` / `npm`)
- [x] Strict TypeScript configuration
- [x] `@clinic/shared` package with Zod validation schemas and Arabic text normalization
- [x] Prisma database schema with all 12 operational tables and enums
- [x] Database pushed to Supabase PostgreSQL instance
- [x] Seed script: Admin account, specializations, doctors with schedules, test catalog
- [x] NestJS API: JWT in httpOnly cookies, Role-based guard (`ADMIN`, `FRONT_DESK`, `DOCTOR`, `LAB`), Swagger docs (`/api/docs`), Audit logging
- [x] Staff Web UI: Next.js 15, `next-intl` (English & Arabic with full RTL), language switcher, login page, and Next.js `/api/*` rewrite to NestJS

---

## Phase 1 Front Desk & Appointments Status

- [x] Specialization and Doctor management APIs (CRUD, active filtering, weekly schedules with `maxPatients`).
- [x] Patient search with Arabic letter normalization (`أ/إ/آ` -> `ا`, `ى` -> `ي`, diacritics ignored) and patient registration.
- [x] Concurrency-safe appointment booking using atomic `doctor_day_counters` row upsert/increment within database transactions.
- [x] Validation against doctor working weekdays and session start time.
- [x] Automated concurrency test (`apps/api/src/appointments/__tests__/appointments.service.spec.ts`) passing: verifies unique sequential queue numbers and non-working day rejection.
- [x] Bilingual 80mm thermal receipt printing at `/print/appointment/:id` with CSS `@page { size: 80mm auto; }` and auto-printing.
- [x] Front Desk Dashboard (`/dashboard/front-desk`): Patient lookup/registration, booking flow with assigned queue modal, and today's appointments table with doctor filter and cancellation.

---

## Phase 2 Laboratory Status

- [x] **Lab Test Catalog CRUD:** `/api/lab-tests` for `ADMIN`, with catalog listing for `FRONT_DESK` and `LAB`.
- [x] **Lab Order Booking with Portal Account Auto-Creation:** `POST /api/lab-orders` generates an 8-char unambiguous ID and 10-char password in a single transaction, saves the bcrypt hash, and queues `ACCOUNT_UPSERT` in `sync_outbox`. Subsequent orders reuse the existing account.
- [x] **Ephemeral Plaintext Password Security:** The plaintext password exists solely on the booking/reissue response for printing the receipt and is never stored in DB or logged.
- [x] **80mm Bilingual Lab Receipt:** Dedicated receipt at `/print/lab/:id` with patient details, requested tests, portal URL, user ID, and temporary password.
- [x] **Lab Result Entry & Status Flow:** `/dashboard/lab` & `/dashboard/lab/[id]` with status tabs, result inputs, and flags (`NORMAL`, `HIGH`, `LOW`). Order automatically transitions from `BOOKED` to `IN_PROGRESS`.
- [x] **Order Completion Guard:** `POST /api/lab-orders/:id/complete` rejects completion if any test item lacks a result, transitions to `COMPLETED`, and queues `RESULT_UPSERT` in `sync_outbox`.
- [x] **Audited Post-Completion Edits:** Editing a completed result logs an entry in `audit_log` with before/after values and queues an updated `RESULT_UPSERT`.
- [x] **Credential Reissue:** `POST /api/patients/:id/portal-account/reissue` allows front desk / admin to generate a new password and queue sync.
- [x] **Acceptance Tests:** `apps/api/src/lab/__tests__/lab.service.spec.ts` passing all acceptance criteria.

---

## Phase 3 Patient Portal & Sync Status

- [x] Portal login with signed `httpOnly` sessions, account lockout and database-backed IP throttling.
- [x] Patient-scoped results list/detail, password change, and A4 PDF download with Arabic fonts.
- [x] HMAC-signed account/result sync, retrying local outbox worker, and admin outbox monitor.
- [x] Focused tests for signatures, result ownership filters, and worker ordering/retries.
- [x] Apply the portal schema migration to Supabase; the portal tables and RLS are verified.
- [ ] Deploy to Vercel and run live sync/login/PDF acceptance checks. See the deployment instructions below.

---

## Phase 4 Doctor Screens, Reports & Polish Status

- [x] **Doctor Queue Screen (`/dashboard/doctor`):** Authenticated doctors view their daily patient queue in real-time, filtered by date, with consultation attendance marking ("Mark as Seen").
- [x] **Operational Reports (`/dashboard/reports`):**
  - Appointments per doctor per day with breakdown by status (seen, booked/waiting, cancelled).
  - Diagnostic laboratory orders per day with status counts and total tests performed.
  - Date range filtering (`from`, `to`) and bilingual presentation.
- [x] **Role Separation & Navigation:**
  - `DOCTOR` (`doctor` / `Doctor@123456`) accesses Doctor Queue only; Front Desk and Lab workflows are hidden/restricted.
  - `ADMIN` accesses all clinic operational modules including Reports and Cloud Sync.
- [x] **Automated Tests:** Unit tests for `ReportsService` passing with 100% test coverage.
- [x] **E2E Testing Suite:** Playwright end-to-end specifications covering all clinical workflows (`pnpm test:e2e`).

The implementation must not be considered fully acceptance-tested until the deployment checks are complete.

---

## Setup & Running Locally

### 1. Environment Setup
Copy the example environment files:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/staff-web/.env.example apps/staff-web/.env
cp apps/portal/.env.example apps/portal/.env
```

### 2. Database Schema & Seeding
```bash
npm --prefix apps/api run prisma:generate
npm --prefix apps/api run prisma:seed
```

### 3. Start Development Servers
- **API (NestJS):**
  ```bash
  cmd.exe /c "npm --prefix apps/api run start:dev"
  ```
  Runs at `http://localhost:3001/api` (Swagger docs at `http://localhost:3001/api/docs`).
- **Staff Web (Next.js):**

  ```bash
  cmd.exe /c "npm --prefix apps/staff-web run dev"
  ```

  Runs at `http://localhost:3000`. Default seeded admin: `admin` / `Admin@123456`.

- **Patient Portal (Next.js):**
  ```bash
  pnpm --filter @clinic/shared run build
  pnpm --filter @clinic/portal run dev
  ```
  Runs at `http://localhost:3002`.

### Patient Portal Database

The portal uses its own Prisma schema and the PostgreSQL `portal` schema; it does not read clinic-operational tables. Configure `apps/portal/.env` with:

- `DATABASE_URL`: Supabase transaction-pooler URL (port `6543`, with `pgbouncer=true`) for runtime queries.
- `DIRECT_URL`: Supabase session-pooler URL (port `5432`) for Prisma migrations on this IPv4-only network. Use the connection string from the Supabase Dashboard.
- `SESSION_SECRET`: a private random secret of at least 32 bytes.
- `SYNC_SECRET`: the same private random secret configured in `apps/api/.env`.

The initial portal migration has been applied to the configured Supabase project. The direct database endpoint resolves to IPv6 and was unreachable from this machine, so the existing pooler credentials were used with the IPv4 session-pooler endpoint. The portal schema was confirmed empty before applying its migration; Prisma now reports it up to date, and all three portal tables have RLS enabled. No clinic operational tables or rows were modified.

For a new database, confirm the target and apply the portal schema migration from the repository root:

```bash
pnpm --filter @clinic/portal run prisma:deploy
```

For this project, the migration is already applied. Keep `DIRECT_URL` configured to a reachable session-pooler endpoint for future migration commands.

### Deploying the Portal to Vercel

1. Import the repository as a pnpm monorepo and set the project Root Directory to `apps/portal`. Enable access to source files outside that directory so the workspace dependency `packages/shared` can be built.
2. Set the build command to:
   ```bash
   pnpm --filter @clinic/shared run build && pnpm --filter @clinic/portal run build
   ```
   The portal build generates its Prisma client before running `next build`.
3. Add the portal environment variables in Vercel: `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `SYNC_SECRET`, `NEXT_PUBLIC_CLINIC_NAME`, `CLINIC_TIMEZONE`, and `DEFAULT_LOCALE`. Use the same `SYNC_SECRET` in Vercel and the local API; keep `SESSION_SECRET` private to the portal.
4. The initial migration is already applied to the configured Supabase project. For a new database, apply it with `pnpm --filter @clinic/portal run prisma:deploy` using a reachable migration connection, then deploy the Vercel project.
5. Configure `PORTAL_SYNC_URL` in `apps/api/.env` to the deployed portal origin. The local API sends signed HTTPS requests to the portal sync routes; if the portal is unavailable, the outbox retains and retries pending events.

Do not expose either secret through a `NEXT_PUBLIC_` variable or commit populated `.env` files.
