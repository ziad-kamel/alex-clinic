# PROJECT PROGRESS CHECKPOINT & AGENT CONTINUATION GUIDE

> **Last Updated:** 2026-11-22
> **Specification Reference:** `clinic-system-dev-spec.md` (Single source of truth)
> **Active Branch:** `main`

---

## 1. Project Overview & Architectural State

A bilingual (English & Arabic with full RTL) Clinic Management System with a split architecture:
- **Local Clinic Network:** NestJS API (`apps/api`) + Next.js 15 App Router (`apps/staff-web`).
- **Database:** Supabase PostgreSQL instance (project ref: `tuzaatbdyyqyfpwvcyfo`).
  - Clinic operational tables are in `public` schema.
  - Patient Portal models are isolated in the PostgreSQL `portal` schema; its initial migration was applied and verified on 2026-11-20.
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

## 3. Phase 3: Patient Portal & Sync (COMPLETED & VERIFIED)

**Phase 3 implementation and acceptance checks are complete.** The portal, API worker/receivers, and admin outbox monitor are implemented; the Supabase migration is applied; local portal results rendering, production deployment and live synchronization, retry recovery, patient login/password change, result detail, and A4 PDF delivery have been verified.

### Implemented

- [x] Next.js patient portal on port `3002`, with English/Arabic UI, signed 8-hour `httpOnly` sessions, password change, and generic login errors.
- [x] Database-backed IP throttling and per-account 15-minute lockout after five failed attempts.
- [x] Results list/detail and patient-scoped A4 PDF download; Noto Sans Arabic fonts are bundled and traced for the PDF route.
- [x] Signed `POST /api/sync/accounts` and `POST /api/sync/results` receivers with schema validation and idempotent upserts.
- [x] NestJS 30-second outbox worker with HMAC signing, timeout, FIFO retry handling, exponential backoff, and configurable attempt limit.
- [x] Admin-only outbox monitor and failed-row retry endpoint. Outbox responses omit payloads.
- [x] RLS and privilege revocations included in the initial `portal` schema migration.
- [x] Focused tests cover exact-body signature validation, expired signatures, patient-scoped result queries, worker signing/retry, and FIFO behavior.
- [x] README Vercel and database setup instructions; decisions recorded in `DECISIONS.md`.

### Verification and Remaining Acceptance Checks

- [x] Shared package build.
- [x] API, portal, and Staff Web TypeScript checks.
- [x] Focused sync and portal security Jest tests.
- [x] API and portal production builds pass; Staff Web production build also passes with the new security headers.
- [x] Verified the Arabic font files are present in the PDF route's Next.js serverless trace.
- [x] Applied `apps/portal/prisma/migrations/20261120004700_init_portal/migration.sql` to the empty `portal` schema using the IPv4 session pooler; marked the migration applied and verified Prisma status, tables, and RLS.
- [x] Verified a completed result was sent to the local Portal database and the results-page query returns its order.
- [x] Restart the local Portal after setting `CLINIC_TIMEZONE` and confirm the patient results page renders.
- [x] Configure production secrets and deploy the portal to Vercel.
- [x] Verify a completed lab order arrives within about one minute; verify retry recovery while the portal is unreachable.
- [x] Verify patient login, password change, result detail, and A4 PDF in the deployed portal.

### Phase 4: Doctor Screens, Operational Reports & Polish (COMPLETED & VERIFIED)
- [x] **Doctor Queue Screen:** (`/dashboard/doctor`) Authenticated doctors view their daily queue, real-time waiting/seen counts, and mark consultations as seen (`PATCH /appointments/:id/seen`).
- [x] **Operational Reports API:**
  - `GET /reports/appointments-per-doctor?from=&to=` (appointments grouped by doctor per day with booked/seen/cancelled breakdowns).
  - `GET /reports/lab-orders-per-day?from=&to=` (daily diagnostic orders volume and total tests).
  - Strictly protected by `@Roles(StaffRole.ADMIN)`.
- [x] **Reports Dashboard UI:** (`/dashboard/reports`) tabbed operational analytics for administrators with date-range filters and bilingual metric cards.
- [x] **Role Separation & Navigation:**
  - `DOCTOR` (`doctor` / `Doctor@123456`) accesses Doctor Queue only; Front Desk, Lab, and Admin reports are hidden and protected.
  - `ADMIN` accesses Doctor Queue, Reports, Sync Outbox, and all clinic operational modules.
- [x] **Reports Automated Tests:** (`apps/api/src/reports/__tests__/reports.service.spec.ts`) passing with 100% assertion coverage.
- [x] **E2E Testing Suite (Playwright):** Full automated clinical workflows in `e2e/clinical-workflows.spec.ts` covering booking appointments, receipts, lab ordering, result completion, and queue attendance.
- [x] **Documentation & Architecture Decisions:** Updated `README.md`, `CHECKPOINT.md`, and recorded `DECISION-014`, `DECISION-015`, and `DECISION-016` in `DECISIONS.md`.
- [x] **Direct Doctor Linking:** Added `doctorId` foreign key on `staff_users` referencing `doctors.id`. Queue retrieval reliably matches the logged-in doctor account, while administrators have a dropdown selector to view any doctor's queue.
- [x] **Compilation Structure & Watcher Normalization:** Added `apps/api/nest-cli.json` and scoped `apps/api/tsconfig.json` to prevent TypeScript monorepo root inflation. Solved stale watcher execution so that live dev servers always run the latest build artifacts directly from `dist/`. Live queue retrieval verified for doctor account (`doctor`).

### Next Phase: Phase 5 — Online Patient Appointment Booking (PLANNED)

Add a public appointment-booking journey to the patient portal: choose specialization, doctor, and an available date, enter name and phone, then receive the doctor/date queue number. Reuse existing patient records when name and normalized phone match, and assign queue numbers through the same atomic counter used by Front Desk bookings. Online bookings must appear with Front Desk bookings in the daily appointments list, labeled by source.

- [ ] Decide how the internet-facing portal securely reaches the clinic booking API without exposing clinic database credentials or operational tables.
- [ ] Implement public availability and booking endpoints with validation, rate limiting, transactional patient reuse/creation, capacity checks, and shared queue numbering.
- [ ] Add the bilingual portal booking flow and booking confirmation.
- [ ] Include portal bookings in the Front Desk daily list and identify their source.
- [ ] Add automated acceptance and end-to-end coverage for availability, capacity/concurrency, patient reuse, and Front Desk visibility.

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
- **Patient Portal (Port 3002):**
  ```bash
  pnpm --filter @clinic/shared run build
  pnpm --filter @clinic/portal run dev
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
- **Doctor:** `doctor` / `Doctor@123456`
