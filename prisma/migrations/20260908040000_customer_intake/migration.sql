-- Additive migration: preserve original orders, sample details, primers and result links.
ALTER TABLE "Order" ADD COLUMN "intakeVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'Standard';
ALTER TABLE "Order" ADD COLUMN "container" TEXT NOT NULL DEFAULT 'Tubes';
ALTER TABLE "Order" ADD COLUMN "submissionMode" TEXT NOT NULL DEFAULT 'Standard';
ALTER TABLE "Sample" ADD COLUMN "sampleKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sample" ADD COLUMN "tubeLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sample" ADD COLUMN "plateLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sample" ADD COLUMN "well" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sample" ADD COLUMN "templateLength" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Sample" ADD COLUMN "preparation" TEXT NOT NULL DEFAULT 'None requested';
UPDATE "Sample" SET "sampleKey" = 'S' || "position";
CREATE TABLE "Reaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sampleId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "primerName" TEXT NOT NULL,
  "primerSource" TEXT NOT NULL,
  "primerConcentration" TEXT NOT NULL DEFAULT '',
  "storedPrimerReference" TEXT NOT NULL DEFAULT '',
  "primerSequence" TEXT NOT NULL DEFAULT '',
  "purification" TEXT NOT NULL DEFAULT 'Desalted',
  "synthesisScale" TEXT NOT NULL DEFAULT '25 nmol',
  "modification5" TEXT NOT NULL DEFAULT '',
  "modification3" TEXT NOT NULL DEFAULT '',
  "modificationInternal" TEXT NOT NULL DEFAULT '',
  "specialProtocol" TEXT NOT NULL DEFAULT 'None known',
  CONSTRAINT "Reaction_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Reaction_sampleId_position_key" ON "Reaction"("sampleId", "position");
INSERT INTO "Reaction" ("id", "sampleId", "position", "primerName", "primerSource")
  SELECT 'legacy-' || "id", "id", 1, "primerName", "primerSource" FROM "Sample";
