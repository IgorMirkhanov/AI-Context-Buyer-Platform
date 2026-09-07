-- CreateEnum
CREATE TYPE "CampaignSource" AS ENUM ('platform', 'external');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "source" "CampaignSource" NOT NULL DEFAULT 'platform';
ALTER TABLE "campaigns" ADD COLUMN "synced_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_project_id_external_campaign_id_key" ON "campaigns"("project_id", "external_campaign_id");
CREATE INDEX "campaigns_project_id_source_idx" ON "campaigns"("project_id", "source");
