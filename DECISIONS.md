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
