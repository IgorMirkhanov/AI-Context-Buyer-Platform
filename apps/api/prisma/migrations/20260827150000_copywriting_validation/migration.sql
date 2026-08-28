-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('headline1', 'headline2', 'description', 'sitelink', 'callout');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('draft', 'edited', 'approved');

-- CreateEnum
CREATE TYPE "IssueLevel" AS ENUM ('critical', 'warning');

-- CreateTable
CREATE TABLE "platform_limits" (
    "id" UUID NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "element_type" TEXT NOT NULL,
    "max_length" INTEGER NOT NULL,
    "max_count" INTEGER NOT NULL,

    CONSTRAINT "platform_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "cluster_id" UUID NOT NULL,
    "type" "CreativeType" NOT NULL,
    "text" TEXT NOT NULL,
    "status" "CreativeStatus" NOT NULL DEFAULT 'draft',
    "ab_group" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_issues" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "creative_id" UUID,
    "level" "IssueLevel" NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "auto_fixed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_limits_platform_element_type_key" ON "platform_limits"("platform", "element_type");

-- CreateIndex
CREATE INDEX "ad_creatives_project_id_idx" ON "ad_creatives"("project_id");

-- CreateIndex
CREATE INDEX "ad_creatives_cluster_id_idx" ON "ad_creatives"("cluster_id");

-- CreateIndex
CREATE INDEX "validation_issues_project_id_idx" ON "validation_issues"("project_id");

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "semantic_clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issues" ADD CONSTRAINT "validation_issues_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: лимиты как данные, не хардкод в агентах
INSERT INTO "platform_limits" ("id", "platform", "element_type", "max_length", "max_count") VALUES
  ('11111111-1111-1111-1111-111111111001', 'yandex_direct', 'headline1', 56, 1),
  ('11111111-1111-1111-1111-111111111002', 'yandex_direct', 'headline2', 30, 1),
  ('11111111-1111-1111-1111-111111111003', 'yandex_direct', 'description', 81, 1),
  ('11111111-1111-1111-1111-111111111004', 'yandex_direct', 'sitelink', 30, 4),
  ('11111111-1111-1111-1111-111111111005', 'yandex_direct', 'callout', 25, 8),
  ('22222222-2222-2222-2222-222222222001', 'google_ads', 'headline1', 30, 15),
  ('22222222-2222-2222-2222-222222222002', 'google_ads', 'headline2', 30, 15),
  ('22222222-2222-2222-2222-222222222003', 'google_ads', 'description', 90, 4),
  ('22222222-2222-2222-2222-222222222004', 'google_ads', 'sitelink', 25, 6),
  ('22222222-2222-2222-2222-222222222005', 'google_ads', 'callout', 25, 10);
