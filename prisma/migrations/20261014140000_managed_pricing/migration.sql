CREATE TABLE "PricingSchedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL,
  "rates" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "PricingChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "previousRates" JSONB NOT NULL,
  "rates" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PricingChange_revision_key" ON "PricingChange"("revision");
INSERT INTO "PricingSchedule" ("id", "revision", "rates", "updatedAt") VALUES
('active', 1, '{"sanger-standard-tubes":550,"sanger-standard-plate":450,"sanger-premixed-tubes":450,"sanger-premixed-plate":350,"sanger-ready-tubes":350,"sanger-ready-plate":250,"plasmid-tubes":500,"plasmid-plate":500}', CURRENT_TIMESTAMP);
