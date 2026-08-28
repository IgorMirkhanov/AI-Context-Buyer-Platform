-- CreateEnum
CREATE TYPE "AdWriteActor" AS ENUM ('user', 'autopilot', 'system');

-- CreateEnum
CREATE TYPE "AdWriteAction" AS ENUM ('create_campaign', 'create_ad_groups', 'create_ads', 'add_keywords', 'add_negative_keywords', 'set_budget', 'pause_campaign');

-- CreateEnum
CREATE TYPE "AdWriteStatus" AS ENUM ('success', 'failed');

-- CreateTable
CREATE TABLE "ad_write_audit" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID,
    "actor" "AdWriteActor" NOT NULL,
    "action" "AdWriteAction" NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "AdWriteStatus" NOT NULL,
    "summary_json" JSONB NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_write_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_write_audit_project_id_created_at_idx" ON "ad_write_audit"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "ad_write_audit" ADD CONSTRAINT "ad_write_audit_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_write_audit" ADD CONSTRAINT "ad_write_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
