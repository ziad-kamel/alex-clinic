# Architecture & Implementation Decisions

## DECISION-001: Use Supabase (Cloud PostgreSQL) for Development Database

- **Date:** 2026-11-19
- **Status:** Accepted
- **Context:** The developer does not currently have local PostgreSQL installed on their development machine. The project specification calls for PostgreSQL for both local clinic API and cloud patient portal.
- **Decision:** Use a Supabase project (`tuzaatbdyyqyfpwvcyfo`) as the PostgreSQL database during development. Use schema isolation: `public` schema for the clinic API and `portal` schema for the patient portal within the same Supabase database instance.
- **Alternatives Considered:**
  1. Installing local PostgreSQL directly on Windows or Docker Desktop: blocked/skipped due to current machine setup.
  2. Running two separate Supabase projects: viable, but using separate schemas (`public` and `portal`) on one project achieves database-level schema separation with zero overhead.
- **Consequences:** We use Supabase direct URL (port 5432) for running Prisma migrations and pooled URL (port 6543) for runtime queries. Connection credentials are kept strictly out of git in `.env` files.

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
