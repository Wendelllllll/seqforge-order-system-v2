CREATE TABLE "CustomerNotification" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimToken" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerNotification_eventKey_key" ON "CustomerNotification"("eventKey");
CREATE INDEX "CustomerNotification_status_createdAt_idx" ON "CustomerNotification"("status", "createdAt");
CREATE INDEX "CustomerNotification_userId_kind_createdAt_idx" ON "CustomerNotification"("userId", "kind", "createdAt");
