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
  npm --prefix apps/api run start:dev
  ```
  Runs at `http://localhost:3001/api` (Swagger docs at `http://localhost:3001/api/docs`).
- **Staff Web (Next.js):**
  ```bash
  npm --prefix apps/staff-web run dev
  ```
  Runs at `http://localhost:3000`. Default seeded admin: `admin` / `Admin@123456`.
