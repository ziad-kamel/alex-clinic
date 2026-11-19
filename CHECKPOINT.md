# PROJECT PROGRESS CHECKPOINT & AGENT CONTINUATION GUIDE

> **Last Updated:** 2026-11-20
> **Specification Reference:** `clinic-system-dev-spec.md` (Single source of truth)
> **Active Branch:** `main`

---

## 1. Project Overview & Architectural State

A bilingual (English & Arabic with full RTL) Clinic Management System with a split architecture:
- **Local Clinic Network:** NestJS API (`apps/api`) + Next.js 15 App Router (`apps/staff-web`).
- **Database:** Supabase PostgreSQL instance (project ref: `tuzaatbdyyqyfpwvcyfo`).
  - Clinic operational tables are in `public` schema.
  - Cloud Patient Portal will use `portal` schema/models (Phase 3).
- **Core Conventions:**
  - All timestamps stored in UTC (`timestamptz`), displayed in `CLINIC_TIMEZONE` (`Africa/Cairo`).
  - Western digits (`0-9`) used uniformly across English and Arabic interfaces.
  - Plaintext passwords exist **only once** on printed receipts; never written to DB or audit logs (bcrypt hashed).
  - All business logic decisions are logged sequentially in `DECISIONS.md`.

---

## 2. Completed Phases & Acceptance Status

### Phase 0: Foundation (COMPLETED & VERIFIED)
- [x] Monorepo structure (`pnpm-workspace.yaml`, root `package.json`, `@clinic/shared`).
- [x] Strict TypeScript configuration and Zod sync validation schemas.
- [x] Prisma schema with all 12 operational models and enums pushed to Supabase.
- [x] Database seeded with Admin (`admin` / `Admin@123456`), Front Desk (`frontdesk` / `Staff@123456`), specializations, sample doctors with schedules, and lab test catalog.
- [x] NestJS API: JWT in `httpOnly` cookies, `JwtAuthGuard`, `RolesGuard`, Swagger at `/api/docs`.
- [x] Staff Web UI: Next.js 15, `next-intl` bilingual setup (`en.json`, `ar.json`), language switcher with dynamic RTL layout mirroring (`dir="rtl"` vs `dir="ltr"`).

### Phase 1: Front Desk & Appointments (COMPLETED & VERIFIED)
- [x] Specialization and Doctor management APIs (CRUD, active filtering, weekly schedules with `maxPatients`).
- [x] Patient search with Arabic letter normalization (`أ/إ/آ` -> `ا`, `ى` -> `ي`, `ة` -> `ه`, diacritics ignored) and patient registration.
- [x] **300ms Debounced Patient Search** with `AbortController` cancellation and server-side pagination (`limit=6`, `skip`, `page`, `totalPages`).
- [x] Doctor multi-filtering by Specialization dropdown and live Doctor Name query.
- [x] **Concurrency-Safe Queue Numbering:** Interactive Prisma transaction utilizing atomic `doctor_day_counters.upsert` with row-level locking and `{ lastNumber: { increment: 1 } }`.
- [x] **Automated Concurrency & Unit Tests:** (`apps/api/src/appointments/__tests__/appointments.service.spec.ts`) passing — validates non-working day rejection and simultaneous booking sequential numbering (1, 2, 3...).
- [x] **Bilingual 80mm Thermal Receipt Printing:** `/print/appointment/:id` using CSS `@page { size: 80mm auto; margin: 0; }` with session cookie forwarding and auto-printing.
- [x] Today's Appointments dashboard table with doctor filter, status badges, cancel action (without renumbering), and reprint button.

### Phase 2: Laboratory (COMPLETED & VERIFIED)
- [x] **Lab Test Catalog CRUD:** (`/api/lab-tests`) for `ADMIN`, listing available for `FRONT_DESK` and `LAB`.
- [x] **Lab Order Booking & Account Generation:** (`POST /api/lab-orders`) transactional booking of multiple tests. If patient lacks a portal account, auto-generates 8-char unambiguous ID, 10-char password, bcrypt hash, and queues `ACCOUNT_UPSERT` in `sync_outbox`. Subsequent orders reuse the account and return null password.
- [x] **80mm Bilingual Lab Receipt:** (`/print/lab/:id`) thermal receipt displaying clinic name, receipt number, patient details, requested tests, portal access URL, portal user ID, and temporary password (only on creation/reissue).
- [x] **Lab Results Entry Interface:** (`/dashboard/lab` & `/dashboard/lab/[id]`) filtering by status (`BOOKED`, `IN_PROGRESS`, `COMPLETED`), individual test result value input and flags (`NORMAL`, `HIGH`, `LOW`).
- [x] **Strict Role-Based UI & Access Enforcement:**
  - `FRONT_DESK`: Can register/search patients, book doctor appointments and lab tests, view lab orders/results read-only, and print receipts/reports. CANNOT enter/edit results or complete orders (API returns 403).
  - `LAB`: Can search/view and register patients, book lab tests, and enter/edit results and complete orders. CANNOT update patient contact details, reissue portal credentials, or book/manage doctor appointments.
  - `ADMIN`: Full access to all operations across clinic modules.
- [x] **Print Patient Test Results Report:** (`/print/results/:id`) full A4 printable diagnostic report with clinic header, patient details, test results table, reference ranges, flags, and auto-print support.
- [x] **Order Completion & Guard:** (`POST /api/lab-orders/:id/complete`) strictly requires all test items to have results. Transitions status to `COMPLETED` and queues `RESULT_UPSERT` in `sync_outbox`.
- [x] **Audited Post-Completion Edits:** Allowed for `LAB` and `ADMIN`, records `audit_log` entry with before/after values and queues updated `RESULT_UPSERT` in `sync_outbox`.
- [x] **Audit Log Endpoint:** (`GET /api/audit-log`) added for `ADMIN` to query and inspect audit trail entries including before/after values.
- [x] **Portal Credential Reissue:** (`POST /api/patients/:id/portal-account/reissue`) generates new password, updates local hash, queues `ACCOUNT_UPSERT`, and logs to audit trail.
- [x] **Automated Acceptance Tests:** (`apps/api/src/lab/__tests__/lab.service.spec.ts`) 100% passing — validates account creation/reuse, bcrypt hash security, completeness guard, and post-completion audit logging.

### Phase 2 Role-Separation Correction (2026-11-20)
- [x] Confirmed live `frontdesk` account role is `FRONT_DESK`; live `lab` account role is `LAB`.
- [x] Confirmed `PUT /lab-orders/:id/items/:itemId/result` returns 403 for Front Desk.
- [x] Corrected `POST /lab-orders` and lab receipt access to include Laboratory staff.
- [x] Updated laboratory order list labels so Front Desk users see read-only result actions.

### Laboratory Patient Access (2026-11-20)
- [x] Laboratory staff can search and view patient profiles.
- [x] Laboratory staff can register new patients.
- [x] Laboratory staff can use the shared patient/lab workflow; appointment booking and appointment list are hidden.
- [x] Patient contact updates, credential reissue, and doctor appointments remain restricted to Front Desk and/or Admin.
- [x] API role checks verified: Laboratory patient search/registration allowed; patient updates and doctor appointment booking return 403 for Laboratory accounts.
- [x] API role checks verified: Front Desk result edits return 403; Laboratory lab booking and lab receipt access allowed.

---

## 3. Next Phase: Phase 3 — Patient Portal & Sync

The next agent or turn MUST begin **Phase 3: Portal and Sync** per `clinic-system-dev-spec.md` Section 12:

### Key Tasks:
1. **Patient Portal Web App (`apps/portal/`):**
   - Next.js App Router (deployed to Vercel).
   - Custom session using signed JWT (`jose`) in `httpOnly` cookie.
   - Portal login with rate limiting & lockout (15 minutes after 5 failed attempts).
   - Results list & detail view (A4 layout).
   - A4 PDF generation & download for each completed order.
   - Change password screen.
2. **Sync Outbox & Worker:**
   - Background sync worker running every 30 seconds (`@nestjs/schedule`).
   - Push `PENDING` outbox rows via HMAC-SHA256 signed HTTPS requests (`X-Timestamp`, `X-Signature`) using `SYNC_SECRET`.
   - Portal sync receivers: `POST /api/sync/accounts` and `POST /api/sync/results` with idempotent upserts.
3. **Admin Outbox Monitor:**
   - View pending/sent/failed outbox rows and retry failed syncs.

---

## 4. Development Run Commands

### Starting the Servers
- **NestJS API (Port 3001):**
  ```bash
  cmd.exe /c "npm --prefix apps/api run start:dev"
  ```
- **Staff Web (Port 3000):**
  ```bash
  cmd.exe /c "npm --prefix apps/staff-web run dev"
  ```

### Running Test Suites
- **Run all unit & acceptance tests:**
  ```bash
  cmd.exe /c "npm --prefix apps/api test -- --runInBand --forceExit"
  ```

### Credentials for Testing:
- **Admin:** `admin` / `Admin@123456`
- **Front Desk:** `frontdesk` / `Staff@123456`
- **Laboratory:** `lab` / `Lab@123456`
