-- CreateTable
CREATE TABLE "performance_snapshots" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "ctr" DECIMAL(10,4) NOT NULL,
    "cpc" DECIMAL(14,4) NOT NULL,
    "conversions" INTEGER NOT NULL,
    "cpl" DECIMAL(14,4),
    "spend" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "performance_snapshots_campaign_id_date_key" ON "performance_snapshots"("campaign_id", "date");

-- CreateIndex
CREATE INDEX "performance_snapshots_project_id_idx" ON "performance_snapshots"("project_id");

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_snapshots" ADD CONSTRAINT "performance_snapshots_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
