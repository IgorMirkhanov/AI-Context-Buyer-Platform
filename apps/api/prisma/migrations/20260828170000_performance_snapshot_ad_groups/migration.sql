-- AlterTable
ALTER TABLE "performance_snapshots" ADD COLUMN "ad_group_external_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "performance_snapshots" ADD COLUMN "ad_group_name" TEXT;

-- DropIndex
DROP INDEX "performance_snapshots_campaign_id_date_key";

-- CreateIndex
CREATE UNIQUE INDEX "performance_snapshots_campaign_id_ad_group_external_id_date_key" ON "performance_snapshots"("campaign_id", "ad_group_external_id", "date");
