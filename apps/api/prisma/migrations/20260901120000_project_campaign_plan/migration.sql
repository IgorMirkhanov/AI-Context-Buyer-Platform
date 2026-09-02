-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'campaign_plan';

-- CreateTable
CREATE TABLE "project_campaign_plans" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "plan_json" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "llm_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_campaign_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_campaign_plans_project_id_key" ON "project_campaign_plans"("project_id");

-- AddForeignKey
ALTER TABLE "project_campaign_plans" ADD CONSTRAINT "project_campaign_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
