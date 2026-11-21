# Architecture & Implementation Decisions

## DECISION-001: Use Supabase (Cloud PostgreSQL) for Development Database

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** The developer does not currently have local PostgreSQL installed on their development machine. The project specification calls for PostgreSQL for both local clinic API and cloud patient portal.
- **Decision:** Use a Supabase project (`tuzaatbdyyqyfpwvcyfo`) as the PostgreSQL database during development. Use schema isolation: `public` schema for the clinic API and `portal` schema for the patient portal within the same Supabase database instance.
- **Alternatives Considered:**
  1. Installing local PostgreSQL directly on Windows or Docker Desktop: blocked/skipped due to current machine setup.
  2. Running two separate Supabase projects: viable, but using separate schemas (`public` and `portal`) on one project achieves database-level schema separation with zero overhead.
- **Consequences:** Runtime queries use the Supabase transaction pooler (port 6543). Prisma migrations use the session pooler (port 5432) on this IPv4-only network; the project's direct endpoint is IPv6-only here. Connection credentials are kept strictly out of git in `.env` files.

## DECISION-002: Concurrency-Safe Queue Numbering using Atomic Row Increment & Extended Transaction Timeout

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** Section 7.1 requires that queue numbers start at 1 per doctor per date, and concurrent bookings never receive duplicate numbers. In development, queries communicate over remote cloud latency with Supabase.
- **Decision:** Use `tx.doctorDayCounter.upsert` with `{ lastNumber: { increment: 1 } }` inside an interactive Prisma database transaction. Configured `maxWait: 15000` and `timeout: 20000` on the transaction to withstand network round-trips while maintaining strict serializability on the counter row.
- **Alternatives Considered:**
  1. Count-based numbering (`SELECT COUNT(*) FROM appointments`): rejected because concurrent requests read the same count and generate collisions.
  2. PostgreSQL sequence per doctor/date: rejected due to dynamic creation complexity of sequences per date.
- **Consequences:** Concurrency tests verify that multiple simultaneous bookings for the same doctor and date consistently return unique, sequential queue numbers (1, 2, 3...) with zero collisions.

## DECISION-003: Isolated 80mm Browser Thermal Receipt Printing via Dedicated CSS @page Rule

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** Section 3 & 7.2 specify browser printing for 80mm thermal receipts with isolated print logic, so direct ESC/POS printing can be added later without touching business logic.
- **Decision:** Created a standalone route `/print/appointment/:id` with a specialized `PrintButton` component that auto-opens `window.print()` and a CSS `@page { size: 80mm auto; margin: 0; }` container. All labels are bilingual (English and Arabic on each line).
- **Alternatives Considered:**
  1. Direct client-side WebUSB/ESC-POS socket library: postponed as printer hardware is unknown at this phase.
  2. Canvas/PDF-based thermal generation: unnecessary overhead for modern thermal print spoolers.
- **Consequences:** Prints cleanly on thermal 80mm paper rolls as well as previewing crisply in any standard browser.

## DECISION-004: Patient Search Debouncing (300ms) with AbortController and Server-Side Pagination

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** Front desk search needed instant search-as-you-type for patient names and phones without overloading the database with a query on every raw keystroke as the patient database scales.
- **Decision:** Implemented a 300ms debounce timer in the React client coupled with `AbortController` cancellation for in-flight requests, and server-side pagination (`skip`, `take`, `count`) in the NestJS API. Added separate filters for name and phone and doctor specialization/name multi-filtering.
- **Alternatives Considered:**
  1. Instant querying on every keydown: rejected due to DB connection pressure and server overhead.
  2. Client-side full table filtering: rejected because loading all patients into memory is unscalable for a production clinic.
- **Consequences:** Real-time search experience with minimal database queries and zero stale-response race conditions.

## DECISION-005: Cryptographically Secure Unambiguous Credential Generation & Ephemeral Plaintext Handling

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** Section 7.4 mandates generating random 8-character `portal_user_id` without ambiguous characters (no `0`, `O`, `1`, `I`, `L`) and 10-character passwords, ensuring plaintext passwords appear ONLY once on the printed receipt and are never stored or logged.
- **Decision:** Implemented `crypto.randomBytes`-selected strings using character set `ABCDEFGHJKMNPQRSTUVWXYZ23456789` for user IDs and added lowercase for passwords. Passwords are saved solely as bcrypt hashes (cost factor 10) in `portal_accounts_local`. The plain password is provided strictly in the booking/reissue API response payload for immediate 80mm thermal receipt printing and is excluded from any audit logs, database tables, or server logs.
- **Alternatives Considered:**
  1. Sequential numeric IDs: rejected due to patient enumeration security risks.
  2. Storing reversible encrypted passwords: rejected per non-negotiable security rules in Section 9.
- **Consequences:** Safe, collision-checked credential generation with zero plaintext credential exposure at rest.

## DECISION-006: Atomic Lab Order Booking with Transactional Account Creation & Sync Outbox Queuing

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** When booking lab tests for a patient without an existing portal account, the lab order, test items, portal account local record, and cloud synchronization outbox entry must be created reliably together.
- **Decision:** Wrapped order creation, existing account check, portal account creation, and `sync_outbox` (`ACCOUNT_UPSERT`) row insertion in a single Prisma interactive transaction (`maxWait: 15000, timeout: 20000`). If a patient already possesses an account, the existing `portal_user_id` is linked and no new account or plaintext password is generated.
- **Alternatives Considered:**
  1. Creating portal accounts asynchronously via background workers: rejected because the front desk must print the credentials receipt immediately upon booking.
- **Consequences:** Eliminates orphaned orders or unsynchronized patient credentials; second orders safely reuse the existing account.

## DECISION-007: Mandatory Completeness Guard for Lab Order Finalization & Audited Post-Completion Edits

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** Section 7.3 specifies that lab staff cannot complete an order if any test item lacks a result, and editing results after completion is restricted to `LAB` and `ADMIN` with audit trail recording.
- **Decision:** `completeLabOrder()` enforces that every `LabOrderItem` has a non-empty `resultValue`, updating order status to `COMPLETED` and queuing a `RESULT_UPSERT` in `sync_outbox`. `enterResult()` checks order status: if already `COMPLETED`, it writes an `audit_log` entry with previous and updated values and re-queues a new `RESULT_UPSERT` to keep the patient portal synchronized.
- **Alternatives Considered:**
  1. Allowing partial completion: rejected per specification Section 7.3.
- **Consequences:** Ensures only complete, verified diagnostic results reach the portal while preserving full accountability for post-verification amendments.

## DECISION-008: Strict Role-Based Separation & UI Enforcement for Front Desk vs Laboratory Staff

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** The system roles require clear separation of duties: Front Desk staff handle patient intake, appointments, receipt printing, and result viewing/printing for patients, but must NEVER edit test results or complete lab orders. Laboratory staff handle order intake and complete result entry/management, but must NOT book doctor appointments.
- **Decision:** Enforced role separation at both API and UI levels:
  1. **API Layer:** `PUT /lab-orders/:id/items/:itemId/result` and `POST /lab-orders/:id/complete` strictly restricted to `LAB` and `ADMIN` via `@Roles(Role.LAB, Role.ADMIN)` guard.
  2. **Staff Web UI - Lab Order Details (`/dashboard/lab/[id]`):** Evaluates `currentUser.role`. Front Desk users see a read-only table with result values, reference ranges, and flags with an informational banner, hiding all input fields, save buttons, and order finalization controls. A "Print Results" button (`/print/results/[id]`) is provided for both roles.
  3. **Staff Web UI - Front Desk (`/dashboard/front-desk`):** Detects `LAB` users and disables/hides the "Book Doctor Appointment" tab, defaulting them directly to the "Book Lab Tests" tab with an informational note.
  4. **Staff Web UI - Navigation & Dashboard:** Dynamic role-aware navigation links and dashboard cards ensure each staff member only accesses authorized operational flows.
- **Alternatives Considered:**
  1. Single shared booking interface with unrestricted tabs: rejected as it violates clinic operational protocols and audit compliance.
- **Consequences:** Front desk staff can safely distribute printed results to patients without risk of accidental data mutation, while lab staff have dedicated result workflows.

## DECISION-009: Correct Laboratory Booking and Receipt Permissions for Lab Staff

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context:** The role separation requirement allows Laboratory staff to book lab tests and print lab receipts, while Front Desk staff may view and print completed results but never enter or edit them.
- **Decision:** Added `LAB` to the `POST /lab-orders` and `GET /lab-orders/:id/receipt` role guards. Result entry and completion remain restricted to `LAB` and `ADMIN`. The laboratory order list now derives edit controls from the live staff role and presents Front Desk users with a "View Details" action rather than an "Enter Results" action.
- **Alternatives Considered:** Relying only on UI labels or leaving booking hidden from the API was rejected; each operational action must be enforced server-side, and role-specific UI labels must match the enforced permissions.
- **Consequences:** Laboratory staff can create lab orders and print their receipts, Front Desk staff remain read-only for results, and neither UI state nor stale labels imply permissions that the API will not allow.

## DECISION-010: Patient Lookup and Registration for Laboratory Staff

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context:** Laboratory staff must be able to search existing patients and register a patient before booking a laboratory order, but must remain unable to book or manage doctor appointments.
- **Decision:** Added `LAB` permission to patient search, patient detail, and patient registration endpoints. Patient updates remain restricted to `FRONT_DESK` and `ADMIN`. The Staff Web navigation exposes the shared patient/lab booking page to `LAB`, while the page forces the lab booking tab and hides appointment controls and portal credential reissue actions.
- **Alternatives Considered:** Granting the entire Front Desk role to Lab staff was rejected because that would expose appointment workflows. A separate patient-only page was unnecessary because the existing Front Desk page already provides shared patient search/registration and lab booking behavior.
- **Consequences:** Laboratory staff can find or register patients and book lab tests; doctor appointments and patient contact edits remain outside their permissions.

## DECISION-011: Isolated Patient Portal Schema and Signed Outbox Synchronization

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context:** The portal requires cloud-hosted accounts and results, while the clinic operational data remains in the existing Supabase PostgreSQL project. Sync must work asynchronously without making local order completion depend on portal availability.
- **Decision:** Keep portal models in the separate PostgreSQL `portal` schema with a dedicated generated Prisma client. Enable RLS and revoke direct `PUBLIC`, `anon`, and `authenticated` access. The local NestJS worker sends allow-listed outbox payloads every 30 seconds, signs the exact JSON body and timestamp with HMAC-SHA256, and retries with capped exponential backoff. The portal verifies timestamp/signature and performs idempotent upserts. Outbox monitoring omits payloads because account events contain password hashes.
- **Alternatives Considered:** Storing portal data in the clinic `public` schema was rejected because the portal must not access operational tables. Synchronous portal calls during lab completion were rejected because internet outages must not prevent local work.
- **Consequences:** The portal accesses only its schema through its private server-side database connection. The initial migration is applied and verified; production secrets and deployment are still required before live cloud synchronization can be verified.

## DECISION-012: Database-Backed Portal Login Throttling and Patient-Scoped Results

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context:** Portal authentication runs in serverless instances and must enforce consistent lockout and rate limits across instances while ensuring result pages and PDFs never expose another patient's data.
- **Decision:** Use an HMAC-hashed IP key in the portal database for a 15-minute request window, with a 20-attempt per-IP ceiling, plus a 15-minute account lock after five failed password attempts. Use a generic invalid-credentials response and equalize the unknown-user bcrypt work. Portal result queries are constructed by a shared helper that always includes the session's patient reference, including detail and PDF requests.
- **Alternatives Considered:** Per-process memory rate limits were rejected because serverless instances do not share state. Filtering by a URL/order identifier alone was rejected because it permits insecure direct-object access.
- **Consequences:** Login throttling survives process restarts and result access is ownership-scoped at the database query boundary.

## DECISION-013: A4 Portal PDF and Web Security Headers

- **Date:** 2026-11-20
- **Status:** Accepted
- **Context:** Patients need printable English/Arabic lab reports that match the on-screen result, and both web apps require baseline browser security headers.
- **Decision:** Generate A4 PDFs server-side with `@react-pdf/renderer`, bundle Noto Sans Arabic regular/bold fonts under the OFL license, and include those fonts in the PDF route's serverless output trace. Configure CSP and standard content-type, framing, referrer, and permissions headers for both Next.js apps.
- **Alternatives Considered:** Browser-side PDF generation was rejected because it would duplicate report formatting and Arabic font handling across clients.
- **Consequences:** Reports use a consistent server-rendered layout and include Arabic glyph support. PDF and live browser rendering still require deployment verification after the portal database is available.

## DECISION-014: Doctor Queue Attendance & Operational Reporting Architecture

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** Section 8 and Section 12 require Phase 4 features:
  1. A dedicated Doctor queue screen allowing authenticated doctors to view their daily assigned queue and mark consultations as "seen".
  2. Operational clinic reports: appointments per doctor per day, and daily diagnostic test volume.
- **Decision:**
  1. **Doctor Queue Mapping:** `getDoctorQueue(doctorUserId, date)` supports resolving the doctor's record by matching the authenticated `StaffUser`'s ID or name against the operational `Doctor` table.
  2. **Security & Role Boundaries:** `GET /doctor/queue` and `PATCH /appointments/:id/seen` are protected by `@Roles(StaffRole.DOCTOR, StaffRole.ADMIN)`. Other roles receive 403 Forbidden.
  3. **Reporting Service:** Implemented `ReportsService` in NestJS API (`GET /reports/appointments-per-doctor` and `GET /reports/lab-orders-per-day`), restricted strictly to `ADMIN` staff.
  4. **Frontend Integration:** Built bilingual UI with RTL support in Next.js Staff Web at `/dashboard/doctor` and `/dashboard/reports`.
- **Alternatives Considered:** Allowing all roles to access doctor queues or reports was rejected per specification role tables.
- **Consequences:** Doctors have an isolated, real-time consultation workflow, and administrators have real-time visibility into clinic workload metrics without affecting transaction performance.

## DECISION-015: Direct Doctor Profile Association via Foreign Key on Staff Users

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** The `staff_users` table stores system login accounts, while the `doctors` table represents clinical doctor profiles with schedules and appointments. Relying on username or name string matching was fragile, prevented multiple doctors from sharing names, and caused queue lookups to fail when staff account IDs differed from doctor profile IDs.
- **Decision:**
  1. **Foreign Key Relation:** Added `doctorId` (`doctor_id UUID REFERENCES doctors(id)`) to `staff_users`, with a reciprocal `staffUsers` relation on `doctors`.
  2. **JWT & Session Context:** Included `doctorId` in `JwtPayload` and `AuthService.login` response.
  3. **Queue Lookup (`getDoctorQueue`):** Directly queries appointments by `currentUser.doctorId`. If the user is an `ADMIN`, they can optionally select and view any doctor's queue via `?doctorId=...`.
  4. **Frontend UI:** Shows the doctor's name badge for logged-in doctors, and exposes a Doctor dropdown selector when viewed by administrators.
- **Alternatives Considered:** Name string matching (rejected due to name collisions and case sensitivity issues).
- **Consequences:** Unambiguous 1-to-1 or N-to-1 linking between login credentials and doctor records; queue queries reliably load the exact doctor's booked appointments.
