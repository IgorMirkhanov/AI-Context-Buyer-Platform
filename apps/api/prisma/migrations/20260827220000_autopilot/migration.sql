-- AlterTable
ALTER TABLE "projects" ADD COLUMN "autopilot_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN "autopilot_enabled_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "optimization_recommendations" ADD COLUMN "applied_by" TEXT;
