-- CreateEnum
CREATE TYPE "OptimizationRecType" AS ENUM ('pause_campaign', 'reduce_budget', 'add_negative');

-- CreateEnum
CREATE TYPE "OptimizationRecStatus" AS ENUM ('proposed', 'approved', 'rejected', 'applied', 'failed');

-- CreateTable
CREATE TABLE "optimization_recommendations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "type" "OptimizationRecType" NOT NULL,
    "status" "OptimizationRecStatus" NOT NULL DEFAULT 'proposed',
    "evidence_json" JSONB NOT NULL,
    "action_json" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "optimization_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "optimization_recommendations_project_id_idx" ON "optimization_recommendations"("project_id");

-- CreateIndex
CREATE INDEX "optimization_recommendations_campaign_id_idx" ON "optimization_recommendations"("campaign_id");

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_recommendations" ADD CONSTRAINT "optimization_recommendations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
