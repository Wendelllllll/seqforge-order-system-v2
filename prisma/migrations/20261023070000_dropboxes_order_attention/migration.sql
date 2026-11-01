-- Additive fields preserve existing orders, results, status history and prices.
ALTER TABLE "Order" ADD COLUMN "statusRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "holdReason" TEXT,
  ADD COLUMN "holdPreviousStatus" TEXT;
ALTER TABLE "StatusHistory" ADD COLUMN "note" TEXT,
  ADD COLUMN "previousStatus" TEXT,
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "actorName" TEXT,
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "StatusHistory_orderId_requestKey_key" ON "StatusHistory"("orderId", "requestKey");

CREATE TABLE "DropboxLocation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "placementInstructions" TEXT NOT NULL,
  "pickupSchedule" TEXT NOT NULL,
  "accessNotes" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DropboxLocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DropboxLocation_active_name_idx" ON "DropboxLocation"("active", "name");
