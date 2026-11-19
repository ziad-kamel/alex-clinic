# Alex Clinic Management System

A web system for clinics with multi-specialty doctors, front desk appointment queueing, laboratory test ordering, and an online patient portal for viewing/downloading test results.

---

## Architecture

- **Local Clinic Network (`apps/api` + `apps/staff-web`):**
  - **API:** NestJS (TypeScript), Prisma ORM, PostgreSQL (via Supabase in dev).
  - **Staff Web:** Next.js (App Router), `next-intl` (English & Arabic with full RTL), Tailwind CSS.
  - **Sync:** Secure HMAC-signed background worker pushes completed results to the cloud.
- **Cloud (`apps/portal`):**
  - Patient portal on Vercel backed by PostgreSQL.
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
