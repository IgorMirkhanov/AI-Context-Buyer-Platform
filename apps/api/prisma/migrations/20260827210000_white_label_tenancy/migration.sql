-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'client';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "slug" TEXT;
ALTER TABLE "organizations" ADD COLUMN "branding_json" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateTable
CREATE TABLE "project_access" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_access_project_id_user_id_key" ON "project_access"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "project_access_user_id_idx" ON "project_access"("user_id");

-- CreateIndex
CREATE INDEX "project_access_project_id_idx" ON "project_access"("project_id");

-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
