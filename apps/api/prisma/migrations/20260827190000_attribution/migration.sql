-- CreateEnum
CREATE TYPE "AttributionProvider" AS ENUM ('bitrix24', 'amocrm', 'calltouch', 'roistat');

-- CreateEnum
CREATE TYPE "ConversionEventType" AS ENUM ('lead', 'deal', 'call');

-- CreateTable
CREATE TABLE "attribution_credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" "AttributionProvider" NOT NULL,
    "token_encrypted" TEXT NOT NULL,
    "extra_encrypted" TEXT,
    "inbound_secret_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attribution_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "campaign_id" UUID,
    "provider" "AttributionProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "type" "ConversionEventType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,4),
    "utm_campaign" TEXT,
    "phone_hash" TEXT,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attribution_credentials_project_id_provider_key" ON "attribution_credentials"("project_id", "provider");

-- CreateIndex
CREATE INDEX "attribution_credentials_project_id_idx" ON "attribution_credentials"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_events_project_id_provider_external_id_key" ON "conversion_events"("project_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "conversion_events_project_id_idx" ON "conversion_events"("project_id");

-- AddForeignKey
ALTER TABLE "attribution_credentials" ADD CONSTRAINT "attribution_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
