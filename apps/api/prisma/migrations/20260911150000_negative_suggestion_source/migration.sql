-- AlterTable
ALTER TABLE "semantic_negative_suggestions"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'llm_negative_words';
