# Clinic Management System: Development Specification

> This document is the single source of truth for building the project. Read all of it before writing code.

---

## 0. Instructions to the AI agent

1. Work **phase by phase** (Section 12). Do not start a phase until the previous phase meets its acceptance criteria.
2. At the end of each phase: run lint, type-check and tests, fix failures, update `README.md`, and make a git commit with the message `phase-N: <summary>`.
3. Do **not** stop to ask questions. When something is unspecified, choose the simplest reasonable option, and record it in `DECISIONS.md` (decision, alternatives considered, reason).
4. Never commit secrets. Use `.env` files and provide `.env.example` files.
5. The security requirements in Section 9 are non-negotiable.
6. Keep code typed (TypeScript strict mode), validated at the edges, and covered by tests for business rules (queue numbering, sync, auth).
7. When finished, produce `DECISIONS.md`, `README.md` (setup and run instructions for local and Vercel), and a final checklist showing each acceptance criterion as passed or failed.

---

## 1. Project overview

A web system for a clinic that has:
- Multiple doctors, each with a specialization.
- A **front desk** where patients book doctor appointments.
- A **blood testing laboratory**.

The system organizes the flow: **booking → doctor appointment (queue) → lab tests → results**.

Patients do not return to the lab to pick up results. Instead, the system creates a **portal account** for each patient. The patient logs in from home with a printed user ID and password and views or downloads their results.

### Roles
| Role | Purpose |
|---|---|
| `ADMIN` | Manages doctors, specializations, schedules, test catalog, staff accounts |
| `FRONT_DESK` | Registers patients, books appointments and lab orders, prints receipts |
| `DOCTOR` | Views their own daily queue, marks patients as seen (Phase 4) |
| `LAB` | Enters and completes lab results |
| Patient (portal only) | Views and downloads their own results |

---

## 2. Final architecture (decided)

Split architecture:

- **Local (inside the clinic):** staff system = NestJS API + Next.js staff web app + PostgreSQL. Works without internet except for the sync to the portal.
- **Cloud (Vercel):** the patient portal = a Next.js app (with its own route handlers) + a managed PostgreSQL database. It holds only patient login data and **completed** results.
- **Sync:** one-way push from the local API to the portal over HTTPS. Only completed lab results and portal account data are sent.

```
 Clinic network                                   Internet
┌──────────────────────────────────────┐        ┌────────────────────────────┐
│ Staff Web (Next.js)  ──►  API (NestJS)│        │  Patient Portal (Next.js)  │
│                              │       │        │  on Vercel                 │
│                         PostgreSQL   │        │       │                    │
│                              │       │  HTTPS │  Managed PostgreSQL        │
│                       Sync worker ───┼───────►│  (portal DB)               │
└──────────────────────────────────────┘        └────────────────────────────┘
```

**Why split:** only the minimum data is exposed to the internet; the front desk keeps working if the internet is down.

---

## 3. Tech stack

| Area | Choice |
|---|---|
| Backend (local) | NestJS (TypeScript) |
| Staff frontend (local) | Next.js (App Router, TypeScript) |
| Patient portal (Vercel) | Next.js (App Router, TypeScript), route handlers for the sync API |
| Database | PostgreSQL (local instance + managed cloud instance for the portal) |
| ORM | Prisma (separate schema for API and portal) |
| Validation | `zod` for Next.js and shared sync schemas; `class-validator` for NestJS DTOs |
| Auth (staff) | JWT in httpOnly cookie, NestJS guards with role checks |
| Auth (portal) | Custom session using signed JWT (`jose`) in httpOnly cookie |
| Password hashing | `bcryptjs` in both apps (same hash format, pure JS, works on Vercel) |
| UI | Tailwind CSS + shadcn/ui |
| PDF (results) | `@react-pdf/renderer` in a portal route handler |
| Receipt printing | **Decided:** browser print of a dedicated 80mm page (CSS `@page`). Printer model unknown for now, so keep all printing logic isolated (one print layout component and one print helper) so direct ESC/POS printing can be added later without touching business logic |
| Scheduled jobs | `@nestjs/schedule` (sync worker) |
| Local deployment | Docker Compose |
| Monorepo | pnpm workspaces |
| Testing | Jest (API), Vitest or Jest (web), Playwright (end-to-end for key flows) |
| i18n | `next-intl`, **English and Arabic from day one**, with full RTL support (see Section 15) |

> Items above beyond NestJS, Next.js, PostgreSQL and Vercel are defaults chosen by the planner. Keep them unless a technical blocker appears, and then log it in `DECISIONS.md`.

---

## 4. Repository structure

```
clinic-system/
├─ apps/
│  ├─ api/            # NestJS, local
│  ├─ staff-web/      # Next.js, local
│  └─ portal/         # Next.js, deployed to Vercel
├─ packages/
│  └─ shared/         # shared types, zod schemas for the sync payloads, constants
├─ docker/
│  ├─ docker-compose.yml
│  └─ backup.sh       # scheduled pg_dump for the local database
├─ DECISIONS.md
├─ README.md
└─ pnpm-workspace.yaml
```

The staff web calls the API through a Next.js rewrite (`/api/*` → NestJS) so the browser sees one origin and no CORS configuration is needed.

---

## 5. Configuration (environment variables)

### API (`apps/api/.env`)
```
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=8h
CLINIC_NAME=
CLINIC_TIMEZONE=            # IANA name, required
PORTAL_BASE_URL=            # public URL of the portal
PORTAL_SYNC_URL=            # portal base URL used by the sync worker
SYNC_SECRET=                # shared HMAC secret with the portal
PUBLIC_BOOKING_GATEWAY_SECRET= # shared HMAC secret for signed portal-to-API booking requests
FORCE_PASSWORD_CHANGE=false # portal: force password change on first login
```

### Staff web (`apps/staff-web/.env`)
```
API_INTERNAL_URL=
NEXT_PUBLIC_CLINIC_NAME=
DEFAULT_LOCALE=en            # en or ar
```

### Portal (`apps/portal/.env`, set in Vercel project settings)
```
DATABASE_URL=               # pooled connection string
DIRECT_URL=                 # direct connection for migrations
SESSION_SECRET=
SYNC_SECRET=                # same value as the API
PUBLIC_BOOKING_API_URL=     # HTTPS-reachable API base URL ending in /api
PUBLIC_BOOKING_GATEWAY_SECRET= # same private secret as the API
NEXT_PUBLIC_CLINIC_NAME=
DEFAULT_LOCALE=en            # en or ar
```

---

## 6. Data model

All timestamps are stored as UTC (`timestamptz`) and displayed in `CLINIC_TIMEZONE`. Dates without time (appointment date) are stored as `date`.

### 6.1 Local database (API)

**patients**: `id`, `name`, `phone`, `phone_normalized`, `extra_phone` (nullable), `created_at`
- `phone` is **not unique** (family members may share a phone). Registration first searches by phone and name; the front desk either selects an existing patient or creates a new one.
- `phone_normalized` contains canonical digits only (Egypt `+20` / `0020` prefixes map to the local leading `0`) and is indexed for public booking patient reuse; existing values are backfilled when the Phase 5 schema change is applied.

**specializations**: `id`, `name` (unique), `name_ar` (nullable)

**doctors**: `id`, `name`, `name_ar` (nullable), `specialization_id`, `active`

**doctor_schedules**: `id`, `doctor_id`, `weekday` (0-6), `start_time`, `end_time`, `max_patients` (nullable)

**appointments**: `id`, `patient_id`, `doctor_id`, `reserved_at`, `appointment_date`, `queue_number`, `status` (`BOOKED` | `SEEN` | `CANCELLED` | `NO_SHOW`), `created_by`, `booking_source` (`FRONT_DESK` | `ONLINE`, defaults to `FRONT_DESK`)
- Unique constraint: (`doctor_id`, `appointment_date`, `queue_number`).

**doctor_day_counters**: `doctor_id`, `date`, `last_number` (primary key on the first two)
- Used to assign queue numbers safely (see Section 7.1).

**lab_tests** (catalog): `id`, `code`, `name`, `name_ar` (nullable), `unit` (nullable), `reference_range` (text, nullable), `active`

**lab_orders**: `id`, `patient_id`, `created_at`, `created_by`, `status` (`BOOKED` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`), `completed_at` (nullable), `synced_at` (nullable)

**lab_order_items**: `id`, `order_id`, `test_id`, `result_value` (text, nullable), `flag` (`NORMAL` | `HIGH` | `LOW`, nullable), `entered_by` (nullable), `entered_at` (nullable)

**portal_accounts_local**: `id`, `patient_id` (unique), `portal_user_id` (unique), `password_hash`, `created_at`, `reissued_at` (nullable)

**sync_outbox**: `id`, `type` (`ACCOUNT_UPSERT` | `RESULT_UPSERT`), `payload` (jsonb), `status` (`PENDING` | `SENT` | `FAILED`), `attempts`, `last_error`, `next_attempt_at`, `created_at`

**staff_users**: `id`, `name`, `username` (unique), `password_hash`, `role`, `active`

**audit_log**: `id`, `user_id`, `action`, `target_type`, `target_id`, `details` (jsonb), `created_at`

### 6.2 Cloud database (portal)

**portal_accounts**: `id`, `patient_ref` (unique, an opaque id from the clinic system), `user_id` (unique), `password_hash`, `patient_name`, `must_change_password`, `failed_attempts`, `locked_until`, `created_at`, `updated_at`

**portal_results**: `id`, `patient_ref`, `order_ref`, `test_ref`, `test_name`, `test_name_ar`, `value`, `unit`, `reference_range`, `flag`, `completed_at`, `updated_at`
- Unique constraint: (`order_ref`, `test_ref`), so repeated syncs are idempotent upserts.

The portal never receives phone numbers or appointment data.

---

## 7. Business rules

### 7.1 Appointments and queue numbers
- Booking requires: patient, doctor, appointment date.
- The date must fall on a weekday where the doctor has a schedule; reject otherwise. If `max_patients` is set, reject when the day is full.
- Queue number = next number for that doctor on that date, starting at 1 each day.
- Assign the number inside a database transaction using `doctor_day_counters` (upsert with increment and row lock), so two simultaneous bookings never get the same number.
- Cancelling an appointment does **not** renumber others.
- `reserved_at` is set by the server.

### 7.2 Appointment receipt (thermal, 80mm)
Contains: clinic name, receipt number, patient name, phone, doctor name and specialization, reservation date and time, appointment date, queue number, and the doctor's session start time from the schedule (shown as "Session starts").
No fixed time slot is assigned.

### 7.3 Lab orders
- Booking requires: patient and at least one test from the catalog.
- If the patient has no portal account, the system **creates one in the same transaction** (Section 7.4).
- Status flow: `BOOKED` → `IN_PROGRESS` (first result entered) → `COMPLETED` (lab staff presses Complete).
- Complete is allowed only when every item has a result value.
- Editing a result after completion is allowed for `LAB` and `ADMIN`; it must write an audit log entry and queue a new sync.

### 7.4 Portal accounts and credentials
- `portal_user_id`: 8 characters, random, from the alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous characters), generated with `crypto.randomBytes`-based selection.
- Password: 10 characters from the same alphabet plus lowercase letters, generated the same way.
- The plain password is shown/printed **once**, on the lab receipt at creation or reissue. Only the bcrypt hash is stored (locally and in the portal).
- One account per patient, reused for later orders (the receipt for later orders prints the user ID and says the password was given earlier).
- Front desk can **reissue** credentials: generates a new password, prints it, updates the hash locally and queues an `ACCOUNT_UPSERT` sync.
- `FORCE_PASSWORD_CHANGE` (default `false`) sets `must_change_password` on new accounts. Patients can always change their password from the portal.

### 7.5 Lab receipt (thermal, 80mm)
Contains: clinic name, receipt number, patient name, phone, list of tests, order date and time, portal URL, user ID, and the password (only when newly created or reissued).

### 7.6 Sync (local → portal)
- Events that create an outbox row: account created/reissued, order completed, result edited after completion.
- A worker runs every 30 seconds, sends `PENDING` rows in order, retries failures with exponential backoff, and marks rows `SENT` or `FAILED` after a maximum number of attempts (default 10, configurable). `FAILED` rows are visible to admins with a "retry" button.
- Requests to the portal: `POST /api/sync/accounts` and `POST /api/sync/results`.
- Authentication: headers `X-Timestamp` and `X-Signature` = HMAC-SHA256 of `timestamp + "." + rawBody` with `SYNC_SECRET`. The portal rejects timestamps older than 5 minutes and invalid signatures.
- The portal handler validates the body with the shared zod schema and performs idempotent upserts.
- On success, set `lab_orders.synced_at`.

---

## 8. API surface (NestJS)

All routes are prefixed `/api`. All require authentication except login and the narrowly scoped public booking routes added in Phase 5. Roles in brackets.

**Auth**
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`

**Admin**
- CRUD: `/specializations`, `/doctors`, `/doctors/:id/schedules`, `/lab-tests`, `/staff-users` [ADMIN]
- `GET /sync/outbox`, `POST /sync/outbox/:id/retry` [ADMIN]
- `GET /audit-log` [ADMIN]

**Patients** [FRONT_DESK, ADMIN]
- `GET /patients?query=` (search by name or phone), `POST /patients`, `GET /patients/:id`, `PATCH /patients/:id`

**Appointments**
- `POST /appointments` [FRONT_DESK]
- `GET /appointments?date=&doctorId=` [FRONT_DESK, ADMIN]
- `PATCH /appointments/:id/cancel` [FRONT_DESK, ADMIN]
- `GET /appointments/:id/receipt` [FRONT_DESK]
- `GET /doctor/queue?date=` and `PATCH /appointments/:id/seen` [DOCTOR]
- `GET /public/booking/specializations` [public; active specializations only]
- `GET /public/booking/doctors?specializationId=` [public; active doctors for the selected specialization]
- `GET /public/booking/availability?doctorId=&from=&to=` [public; available dates only]
- `POST /public/appointments` [public; rate limited; validates availability and capacity transactionally]

**Lab**
- `POST /lab-orders` [FRONT_DESK]
- `GET /lab-orders?status=&date=` [LAB, FRONT_DESK, ADMIN]
- `GET /lab-orders/:id` [LAB, FRONT_DESK, ADMIN]
- `PUT /lab-orders/:id/items/:itemId/result` [LAB]
- `POST /lab-orders/:id/complete` [LAB]
- `GET /lab-orders/:id/receipt` [FRONT_DESK]
- `POST /patients/:id/portal-account/reissue` [FRONT_DESK, ADMIN]

Use consistent error responses (`{ statusCode, message, errors? }`), pagination for list endpoints, and Swagger/OpenAPI docs at `/api/docs` (local only).

---

## 9. Security requirements (non-negotiable)

- Passwords are hashed with bcrypt (cost 10 or higher). Never log or store plain passwords. The only place a plain portal password exists is the printed receipt response, and it must not be written to logs or the audit log.
- Staff and portal sessions use httpOnly, secure (in production), SameSite cookies.
- Role-based access on every API route; the DOCTOR role only sees their own queue.
- Portal: rate-limit login, lock the account for 15 minutes after 5 failed attempts, return a generic error for wrong ID or password, and never reveal whether a user ID exists.
- Portal: a patient can read **only** their own results (always filter by the session's `patient_ref`).
- Sync endpoints verify the HMAC signature and timestamp and use constant-time comparison.
- All inputs validated; use Prisma parameterized queries only.
- Security headers on both web apps (CSP, X-Frame-Options, Referrer-Policy, etc.).
- Local deployment guide must state: database not exposed outside the Docker network, and HTTPS recommended on the clinic network.
- Audit log entries for: login failures, credential reissue, result edits after completion, cancellations, staff account changes.

---

## 10. Screens

### 10.1 Staff web (`apps/staff-web`)
- **Login**
- **Front desk**
  - Patient search/register
  - Book appointment (doctor picker with specialization, date picker limited to working days, shows the assigned queue number on success)
  - Book lab tests (test picker from catalog, optional search)
  - Receipt print pages: `/print/appointment/:id` and `/print/lab/:id`, styled for 80mm, auto-open the print dialog
  - Today's appointments (filter by doctor, cancel, reprint)
  - Reissue portal credentials
- **Lab**
  - Pending orders list
  - Order detail: enter results per test, flag, complete
- **Doctor** (Phase 4)
  - Today's queue with "Mark as seen"
- **Admin**
  - Doctors, specializations and schedules
  - Test catalog
  - Staff accounts
  - Sync status (outbox) and audit log
- Navigation is shown per role. All UI strings go through `next-intl` with English and Arabic translations, a language switcher, and RTL layout (Section 15).

### 10.2 Patient portal (`apps/portal`)
- **Login** (user ID + password)
- **Results list** (grouped by order, newest first)
- **Result detail** (A4-style layout: clinic name, patient name, date, table of test / result / unit / reference range / flag)
- **Download PDF** (A4) for each order
- **Change password**
- Mobile-friendly layout (patients will mostly use phones)

---

## 11. Local deployment (Docker Compose)

Services: `postgres`, `api`, `staff-web`. Volumes for database data. A `docker/backup.sh` script runs `pg_dump` on a schedule (daily, keep the last 14). Provide a seed command that creates: one admin user, a few specializations, doctors with schedules, and a sample test catalog (e.g., CBC, glucose, creatinine, lipid panel).

README must also explain deploying `apps/portal` to Vercel (root directory, environment variables, running Prisma migrations against the cloud database, using the pooled connection string, and `prisma generate` in the build step).

---

## 12. Phases and acceptance criteria

### Phase 0: Foundation
Tasks: monorepo setup, TypeScript strict, linting, formatting, Prisma setup for API and portal, Docker Compose, auth (login, JWT cookie, role guard), staff user seed, base layout with role-based navigation, full English/Arabic i18n with RTL support (Section 15).
Acceptance: `docker compose up` starts the system; admin can log in; protected routes reject unauthorized roles.

### Phase 1: Front desk and appointments
Tasks: specializations, doctors and schedules (admin); patient search/register; appointment booking with transactional queue numbering; appointment receipt page for 80mm print; today's appointments list with cancel.
Acceptance:
- Booking returns a queue number starting at 1 per doctor per date.
- A concurrency test with 20 simultaneous bookings for the same doctor/date yields 20 unique sequential numbers.
- Booking on a non-working day is rejected.
- Receipt shows all fields from Section 7.2 and prints correctly at 80mm.

### Phase 2: Lab
Tasks: test catalog (admin); lab order booking; portal account creation and credential generation; lab receipt with credentials; lab results entry; complete order; audit log for post-completion edits; reissue credentials.
Acceptance:
- First lab order for a patient creates an account; the second reuses it.
- Plain password appears only on the printed receipt; the database contains only the hash.
- Order cannot be completed with missing results.
- Editing a completed result writes an audit entry.

### Phase 3: Portal and sync
Tasks: portal app, login with session, lockout and rate limiting, results list and detail, A4 PDF download, change password; sync outbox, worker, signed requests, idempotent portal upserts, admin outbox screen; deploy instructions for Vercel.
Acceptance:
- Completing an order makes its results appear in the portal within about one minute.
- With the portal unreachable, completion still works locally and the outbox retries until it succeeds.
- A patient cannot view another patient's results (test included).
- Invalid or expired signatures are rejected by the sync endpoints (tests included).
- PDF downloads as A4 and matches the on-screen result.

### Phase 4: Doctor screens and polish
Tasks: doctor queue screen and "seen" action; reports (appointments per doctor per day, lab orders per day); end-to-end tests (Playwright) for: book appointment and print receipt, book lab test and complete, patient views results.
Acceptance: all end-to-end tests pass; `README.md` and `DECISIONS.md` complete.

### Phase 5: Online patient appointment booking
Tasks: Add an unauthenticated appointment-booking journey to the internet-facing patient portal, while retaining the existing Front Desk booking flow. Patients choose a specialization, an active doctor in that specialization, an available clinic date for that doctor, then enter their name and phone number. The system reuses a matching patient record or creates one, books the appointment, assigns the next doctor/date queue number, and displays the booking confirmation and queue number. Portal bookings appear alongside Front Desk bookings in the existing Front Desk appointments-for-the-day list and are labeled by booking source.

Requirements:
- Use the clinic timezone for dates. Only offer today or future dates on which the doctor is scheduled and has remaining `max_patients` capacity; do not introduce time slots.
- Implement a server-side patient reuse rule using the patient's name and normalized phone together, consistent with the Front Desk intake convention, so family members who share a phone are not merged. Do not expose patient search or patient-existence details through public endpoints.
- Create/reuse the patient, enforce capacity, allocate the queue number using the same concurrency-safe `doctor_day_counters` transaction as Front Desk booking, and save the appointment as one atomic operation. A booking failure must not leave an orphan patient or consume a queue number.
- Record `booking_source` as `ONLINE` or `FRONT_DESK`; existing appointments default to `FRONT_DESK`. The Front Desk daily list includes both sources and identifies online bookings.
- The public portal must call narrowly scoped, validated booking/availability API endpoints. Do not expose clinic database credentials or operational tables to the browser or grant the portal database access to the clinic `public` schema. Before implementation, decide how the internet-facing portal will securely reach the clinic booking API (for example, a hardened public API deployment or a secured network gateway).
- Protect public endpoints from automated abuse with server-side rate limiting and input validation. Return only the public specialization/doctor/date data needed for booking and the submitting patient's own booking confirmation.
- Keep the booking flow bilingual and RTL-compatible, and use Western digits. Include localized validation and availability/full-day errors.
- When using Prisma raw SQL for transaction-scoped advisory locks, return a Prisma-decodable scalar (such as a boolean) rather than PostgreSQL's `void` lock result; the patient identity lock is shared with Front Desk registration.

Acceptance:
- A patient can complete the public specialization → doctor → available date → name and phone flow without a portal results account, then sees the correct doctor, date, and assigned queue number.
- Inactive doctors, dates outside their schedule, past dates, and full dates cannot be booked; simultaneous online and Front Desk bookings cannot exceed capacity or receive duplicate queue numbers.
- Booking a patient already registered with the same matching name and normalized phone reuses the patient row; a different name with a shared phone remains a separate patient.
- Failed booking attempts leave no orphan patient or appointment and do not consume a queue number.
- The authenticated Front Desk appointments list shows online and desk bookings together for the selected day and identifies portal-origin appointments.
- Public routes do not disclose patient-existence information or expose clinic database credentials/data; rate limiting and role boundaries are covered by automated tests.
- The flow and confirmation work in English and Arabic, including RTL layout, Arabic names, and Western digits. End-to-end tests cover online booking and its appearance in the Front Desk daily list.

---

## 13. Out of scope (for now)

Payments and invoicing, SMS/WhatsApp notifications, fixed time-slot scheduling, patient medical records and doctor notes, insurance, native mobile apps.

---

## 14. Definition of done

- All phases' acceptance criteria pass.
- Lint, type-check, unit and end-to-end tests pass.
- No secrets in the repository; `.env.example` files present.
- Every screen, receipt and result page works in both English and Arabic (RTL).
- Local setup works from a clean machine using only `README.md`.
- Portal deploys to Vercel using only `README.md`.

---

## 15. Languages (English and Arabic)

The whole system supports **English and Arabic** from the first phase. Do not add it as a late translation pass.

### Rules
- Use `next-intl` in both `staff-web` and `portal`. No hard-coded UI strings; all text lives in `en.json` and `ar.json`.
- Language switcher in the header of both apps. The choice is remembered per browser (cookie). Default language is configurable per app (`DEFAULT_LOCALE`, default `en`).
- Set `dir="rtl"` and `lang="ar"` when Arabic is active. Use CSS logical properties (`margin-inline-start`, `padding-inline-end`, etc.) and Tailwind's RTL-aware utilities instead of left/right values, so layouts mirror correctly.
- Use a font with good Arabic support (for example Cairo or Noto Sans Arabic) for the UI.
- Store all text as UTF-8. Patient names are stored exactly as typed (Arabic or Latin); search must work for both (normalize Arabic letter variants such as أ/إ/آ → ا and ى → ي, and ignore diacritics, when searching).
- Doctors, specializations and lab tests have an optional Arabic name (`name_ar`). Show the name matching the active language and fall back to the other one if empty.
- Use Western digits (0-9) everywhere, in both languages, for phone numbers, queue numbers, dates and result values.
- Dates and times are formatted per locale but always in `CLINIC_TIMEZONE`.
- Validation and error messages are translated too (API returns error codes; the frontend translates them).

### Receipts and results
- **Thermal receipts** use **bilingual labels** (Arabic and English on each line, for example "Queue number / رقم الدور"), so the receipt looks the same regardless of the language the staff member is using. Names are printed as stored.
- **Portal result pages** follow the patient's selected language. The **A4 PDF** is generated in the language selected at the time of download.
- **Arabic in PDFs:** register an embedded Arabic font (for example Noto Naskh Arabic or Cairo) with `@react-pdf/renderer` and test that letters connect correctly and text direction is right-to-left, including mixed Arabic and Latin text and numbers. If `@react-pdf/renderer` cannot render Arabic correctly, switch to generating the PDF from an HTML template using headless Chromium (`puppeteer-core` with `@sparticuz/chromium` on Vercel), and record the decision in `DECISIONS.md`.
- **Printing:** browser printing is used for receipts. Verify that Arabic text prints correctly at 80mm width.

### Acceptance criteria
- Switching the language in either app flips direction and translates all visible text, with no hard-coded strings left.
- An Arabic patient name can be registered, searched (with and without letter variants) and printed on a receipt.
- Appointment receipt, lab receipt, result page and result PDF each render correctly with Arabic content (screenshots or PDF checks in the end-to-end tests).
