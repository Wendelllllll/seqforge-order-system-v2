-- Add the newly approved >12 kb tier without replacing any existing custom prices.
-- Advancing the revision requires older open order forms to review current pricing.
WITH previous AS (
  SELECT "id", "revision", "rates" FROM "PricingSchedule"
  WHERE "id" = 'active'
    AND (NOT ("rates" ? 'plasmid-large-tubes') OR NOT ("rates" ? 'plasmid-large-plate'))
  FOR UPDATE
), updated AS (
  UPDATE "PricingSchedule" AS schedule
  SET "rates" = '{"plasmid-large-tubes":1500,"plasmid-large-plate":1500}'::jsonb || previous."rates",
      "revision" = previous."revision" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM previous WHERE schedule."id" = previous."id"
  RETURNING schedule."revision", previous."rates" AS "previousRates", schedule."rates"
)
INSERT INTO "PricingChange" ("id", "revision", "actorId", "actorName", "reason", "previousRates", "rates")
SELECT 'migration-whole-plasmid-size-pricing', "revision", 'system-migration', 'SeqForge pricing update',
       'Added approved Whole Plasmid >12 kb pricing at $15 per sample; existing rates and submitted order snapshots are unchanged.',
       "previousRates", "rates"
FROM updated;
