CREATE TABLE "InternalNotification" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InternalNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InternalNotification_eventKey_key" ON "InternalNotification"("eventKey");
CREATE INDEX "InternalNotification_status_createdAt_idx" ON "InternalNotification"("status", "createdAt");
