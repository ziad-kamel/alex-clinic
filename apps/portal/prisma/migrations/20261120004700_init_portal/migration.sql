-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "portal";

-- CreateEnum
CREATE TYPE "portal"."PortalTestFlag" AS ENUM ('NORMAL', 'HIGH', 'LOW');

-- CreateTable
CREATE TABLE "portal"."portal_accounts" (
    "id" UUID NOT NULL,
    "patient_ref" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "portal_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal"."portal_results" (
    "id" UUID NOT NULL,
    "patient_ref" UUID NOT NULL,
    "order_ref" UUID NOT NULL,
    "test_ref" UUID NOT NULL,
    "test_name" TEXT NOT NULL,
    "test_name_ar" TEXT,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "flag" "portal"."PortalTestFlag",
    "completed_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "portal_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal"."portal_login_limits" (
    "ip_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_until" TIMESTAMPTZ,

    CONSTRAINT "portal_login_limits_pkey" PRIMARY KEY ("ip_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_patient_ref_key" ON "portal"."portal_accounts"("patient_ref");

-- CreateIndex
CREATE UNIQUE INDEX "portal_accounts_user_id_key" ON "portal"."portal_accounts"("user_id");

-- CreateIndex
CREATE INDEX "portal_results_patient_ref_completed_at_idx" ON "portal"."portal_results"("patient_ref", "completed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portal_results_order_ref_test_ref_key" ON "portal"."portal_results"("order_ref", "test_ref");

-- CreateIndex
CREATE INDEX "portal_login_limits_window_started_at_idx" ON "portal"."portal_login_limits"("window_started_at");

-- AddForeignKey
ALTER TABLE "portal"."portal_results" ADD CONSTRAINT "portal_results_patient_ref_fkey" FOREIGN KEY ("patient_ref") REFERENCES "portal"."portal_accounts"("patient_ref") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portal"."portal_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal"."portal_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal"."portal_login_limits" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA "portal" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA "portal" FROM PUBLIC, anon, authenticated;
