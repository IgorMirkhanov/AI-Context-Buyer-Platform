-- CreateEnum
CREATE TYPE "OpsAlertKind" AS ENUM ('pipeline_failed', 'oauth_expiring', 'oauth_expired', 'platform_rate_limit');

-- CreateTable
CREATE TABLE "ops_alerts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "OpsAlertKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_alerts_project_id_idx" ON "ops_alerts"("project_id");

-- CreateIndex
CREATE INDEX "ops_alerts_project_id_kind_idx" ON "ops_alerts"("project_id", "kind");

-- AddForeignKey
ALTER TABLE "ops_alerts" ADD CONSTRAINT "ops_alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
