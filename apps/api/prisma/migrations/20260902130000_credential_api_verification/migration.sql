ALTER TABLE "ad_platform_credentials"
  ADD COLUMN "api_verified_at" TIMESTAMP(3),
  ADD COLUMN "api_verification_error" TEXT;

UPDATE "ad_platform_credentials"
SET "api_verified_at" = "created_at"
WHERE "api_verified_at" IS NULL;
