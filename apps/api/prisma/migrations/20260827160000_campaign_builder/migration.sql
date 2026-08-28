-- CreateEnum
CREATE TYPE "CampaignDraftStatus" AS ENUM ('pending_approval', 'publishing', 'published', 'failed');

-- CreateEnum
CREATE TYPE "LiveCampaignStatus" AS ENUM ('paused', 'active', 'archived');

-- CreateTable
CREATE TABLE "campaign_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "structure_json" JSONB NOT NULL,
    "status" "CampaignDraftStatus" NOT NULL DEFAULT 'pending_approval',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "draft_id" UUID,
    "external_campaign_id" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "LiveCampaignStatus" NOT NULL DEFAULT 'paused',
    "budget" DECIMAL(12,2),
    "targeting_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_drafts_project_id_idx" ON "campaign_drafts"("project_id");

-- CreateIndex
CREATE INDEX "campaigns_project_id_idx" ON "campaigns"("project_id");

-- AddForeignKey
ALTER TABLE "campaign_drafts" ADD CONSTRAINT "campaign_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "campaign_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
