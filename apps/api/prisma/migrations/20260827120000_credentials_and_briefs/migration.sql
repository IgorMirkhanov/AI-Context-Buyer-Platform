-- CreateTable
CREATE TABLE "ad_platform_credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT,
    "expires_at" TIMESTAMP(3),
    "scopes" TEXT,
    "external_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_platform_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_briefs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_platform_credentials_project_id_idx" ON "ad_platform_credentials"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_platform_credentials_project_id_platform_key" ON "ad_platform_credentials"("project_id", "platform");

-- CreateIndex
CREATE INDEX "project_briefs_project_id_idx" ON "project_briefs"("project_id");

-- AddForeignKey
ALTER TABLE "ad_platform_credentials" ADD CONSTRAINT "ad_platform_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_briefs" ADD CONSTRAINT "project_briefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
