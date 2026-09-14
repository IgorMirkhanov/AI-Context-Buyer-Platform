-- Optional org-level monthly LLM spend cap (USD). Null = no cap.
ALTER TABLE "organizations" ADD COLUMN "llm_monthly_cap_usd" DECIMAL(12,2);
