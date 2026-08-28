-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('anthropic', 'openai');

-- CreateEnum
CREATE TYPE "AiProviderCredentialStatus" AS ENUM ('unverified', 'valid', 'invalid');

-- CreateTable
CREATE TABLE "ai_provider_credentials" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "api_key_encrypted" TEXT NOT NULL,
    "status" "AiProviderCredentialStatus" NOT NULL DEFAULT 'unverified',
    "last_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_credentials_organization_id_idx" ON "ai_provider_credentials"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_credentials_organization_id_provider_key" ON "ai_provider_credentials"("organization_id", "provider");

-- AddForeignKey
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
