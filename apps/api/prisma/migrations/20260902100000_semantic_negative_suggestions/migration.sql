-- CreateEnum
CREATE TYPE "NegativeSuggestionStatus" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "semantic_negative_suggestions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "phrase" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "NegativeSuggestionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "semantic_negative_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_negative_suggestions_project_id_status_idx" ON "semantic_negative_suggestions"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_negative_suggestions_project_id_phrase_key" ON "semantic_negative_suggestions"("project_id", "phrase");

-- AddForeignKey
ALTER TABLE "semantic_negative_suggestions" ADD CONSTRAINT "semantic_negative_suggestions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
