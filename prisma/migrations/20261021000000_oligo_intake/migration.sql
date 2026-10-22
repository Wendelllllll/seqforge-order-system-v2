-- Oligo requests preserve sequences and requested synthesis/delivery specifications.
-- Existing orders and their saved prices remain unchanged.
ALTER TABLE "Order" ADD COLUMN "oligoSnapshot" JSONB;
