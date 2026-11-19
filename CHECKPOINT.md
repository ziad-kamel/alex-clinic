# PROJECT PROGRESS CHECKPOINT & AGENT CONTINUATION GUIDE

> **Last Updated:** 2026-11-19
> **Specification Reference:** `clinic-system-dev-spec.md` (Single source of truth)
> **Active Branch:** `main` (clean working tree)

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

---

## 3. Current Git Log (Recent Commits)
- `8fea802`: `fix(print): forward staff session cookie to receipt API and document search debouncing decision`
- `c55035d`: `feat(front-desk): implement 300ms debounced search with AbortController for patient lookup`
- `5f9dc6c`: `feat(front-desk): add patient search pagination, name/phone filters, and doctor specialization/name filters`
- `4082b11`: `phase-1: front desk, doctor schedules, transactional queue numbering, 80mm bilingual receipts`

---

## 4. Next Phase: Phase 2 — Laboratory

The next agent or turn MUST begin **Phase 2: Lab** per `clinic-system-dev-spec.md` Section 12:

### Tasks to build:
1. **Lab Test Catalog Management (Admin):**
   - CRUD for `lab_tests` (`id`, `code`, `name`, `name_ar`, `unit`, `reference_range`, `active`).
2. **Lab Order Booking (Front Desk):**
   - Book lab order for a patient with multiple tests from the catalog.
   - **Portal Account Auto-Creation:** If the patient has no portal account, generate one in the same transaction:
     - 8-char random `portal_user_id` from alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous chars).
     - 10-char random password from same alphabet + lowercase letters.
     - Store only bcrypt hash in `portal_accounts_local`.
     - Queue an `ACCOUNT_UPSERT` entry in `sync_outbox`.
3. **Bilingual 80mm Lab Receipt (`/print/lab/:id`):**
   - Prints: clinic name, receipt number, patient name, phone, list of tests, order date/time, portal URL, user ID, and password (**only printed on creation or reissue; never re-shown later**).
4. **Lab Results Entry Interface (Lab Role):**
   - Pending lab orders list.
   - Result entry form per test: `result_value`, `flag` (`NORMAL`, `HIGH`, `LOW`).
   - Status flow: `BOOKED` -> `IN_PROGRESS` (first result entered) -> `COMPLETED` (staff clicks Complete).
   - Validation: Cannot complete if any test item lacks a result value.
5. **Post-Completion Result Edits & Reissue:**
   - Editing a result after completion allowed for `LAB` and `ADMIN`: writes an `audit_log` entry and queues a `RESULT_UPSERT` in `sync_outbox`.
   - Front desk action to reissue credentials (`POST /api/patients/:id/portal-account/reissue`).

---

## 5. Development Run Commands

### Starting the Servers
- **NestJS API (Port 3001):**
  ```bash
  npm --prefix apps/api run start:dev
  ```
- **Staff Web (Port 3000):**
  ```bash
  npm --prefix apps/staff-web run dev
  ```

### Credentials for Testing:
- **Admin:** `admin` / `Admin@123456`
- **Front Desk:** `frontdesk` / `Staff@123456`
