-- Per-account fixed rate overrides. No existing customer, order or rate is changed.
CREATE TABLE "CustomerPricing" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "overrides" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerPricing_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "CustomerPricingChange" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousOverrides" JSONB NOT NULL,
    "overrides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPricingChange_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerPricingChange_customerId_revision_key" ON "CustomerPricingChange"("customerId", "revision");
CREATE INDEX "CustomerPricingChange_customerId_createdAt_idx" ON "CustomerPricingChange"("customerId", "createdAt");
ALTER TABLE "CustomerPricing" ADD CONSTRAINT "CustomerPricing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPricingChange" ADD CONSTRAINT "CustomerPricingChange_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
