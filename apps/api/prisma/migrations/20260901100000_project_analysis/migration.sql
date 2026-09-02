-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'analysis';

-- CreateTable
CREATE TABLE "project_analyses" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "brief_id" UUID,
    "website_url" TEXT NOT NULL,
    "landing_text" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "custom_seeds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "llm_mode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_analyses_project_id_key" ON "project_analyses"("project_id");

-- AddForeignKey
ALTER TABLE "project_analyses" ADD CONSTRAINT "project_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
