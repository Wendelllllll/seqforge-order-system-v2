-- Additive upgrade: preserve historical names, orders and customer details.
ALTER TABLE "User" ADD COLUMN "orderDefaults" JSONB;
ALTER TABLE "Order" ADD COLUMN "fulfillmentSnapshot" JSONB;
ALTER TABLE "Order" ADD COLUMN "orderNameKey" TEXT;
-- Old duplicate names remain intact. Reserve their canonical name on the first order.
WITH ranked AS (
 SELECT id, lower(regexp_replace(trim("orderName"), '[[:space:]]+', ' ', 'g')) AS key,
 row_number() OVER (PARTITION BY "userId", lower(regexp_replace(trim("orderName"), '[[:space:]]+', ' ', 'g')) ORDER BY "createdAt", id) AS n
 FROM "Order"
)
UPDATE "Order" SET "orderNameKey" = ranked.key FROM ranked WHERE "Order".id = ranked.id AND ranked.n = 1;
CREATE UNIQUE INDEX "Order_userId_orderNameKey_key" ON "Order"("userId", "orderNameKey");
