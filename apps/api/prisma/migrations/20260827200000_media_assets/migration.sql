-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'media';

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('generated', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "cluster_id" UUID,
    "kind" "MediaKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "duration_ms" INTEGER,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'generated',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_project_id_idx" ON "media_assets"("project_id");

-- CreateIndex
CREATE INDEX "media_assets_cluster_id_idx" ON "media_assets"("cluster_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "semantic_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
