-- Align campaign_drafts.updated_at with Prisma @updatedAt (no DB default).
-- PostgreSQL DEFAULT only fills INSERT, not UPDATE; the client already
-- writes updated_at on every create/update. Same pattern as projects.updated_at.
ALTER TABLE "campaign_drafts" ALTER COLUMN "updated_at" DROP DEFAULT;
