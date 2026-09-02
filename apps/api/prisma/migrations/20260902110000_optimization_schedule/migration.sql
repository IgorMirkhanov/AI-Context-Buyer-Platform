-- AlterTable
ALTER TABLE "projects" ADD COLUMN "optimization_launched_at" TIMESTAMP(3),
ADD COLUMN "optimization_last_run_at" TIMESTAMP(3),
ADD COLUMN "optimization_next_run_at" TIMESTAMP(3);
