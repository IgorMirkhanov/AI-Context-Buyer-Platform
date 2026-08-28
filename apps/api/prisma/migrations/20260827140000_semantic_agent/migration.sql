-- CreateEnum
CREATE TYPE "KeywordIntent" AS ENUM ('hot', 'warm', 'navigational');

-- CreateEnum
CREATE TYPE "ClusterCategory" AS ENUM ('brand', 'feature', 'geo', 'generic');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('semantic', 'copywriting', 'validation', 'campaign_builder', 'reporting', 'optimization');

-- CreateEnum
CREATE TYPE "AgentTaskStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "semantic_clusters" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ClusterCategory" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_keywords" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phrase" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "intent" "KeywordIntent" NOT NULL,
    "cluster_id" UUID,
    "is_negative" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "agent_type" "AgentType" NOT NULL,
    "status" "AgentTaskStatus" NOT NULL,
    "input_ref" TEXT,
    "output_ref" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_call_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "agent_type" "AgentType" NOT NULL,
    "step" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(12,6) NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_embeddings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phrase" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_clusters_project_id_idx" ON "semantic_clusters"("project_id");

-- CreateIndex
CREATE INDEX "semantic_keywords_project_id_idx" ON "semantic_keywords"("project_id");

-- CreateIndex
CREATE INDEX "semantic_keywords_cluster_id_idx" ON "semantic_keywords"("cluster_id");

-- CreateIndex
CREATE INDEX "agent_tasks_project_id_idx" ON "agent_tasks"("project_id");

-- CreateIndex
CREATE INDEX "llm_call_logs_project_id_idx" ON "llm_call_logs"("project_id");

-- CreateIndex
CREATE INDEX "keyword_embeddings_project_id_idx" ON "keyword_embeddings"("project_id");

-- AddForeignKey
ALTER TABLE "semantic_clusters" ADD CONSTRAINT "semantic_clusters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_keywords" ADD CONSTRAINT "semantic_keywords_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_keywords" ADD CONSTRAINT "semantic_keywords_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "semantic_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_call_logs" ADD CONSTRAINT "llm_call_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_embeddings" ADD CONSTRAINT "keyword_embeddings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
