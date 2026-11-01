-- Better Auth >=1.7.3 no longer writes the 1.7.0-1.7.2 issuer field.
-- Preserve every account, credential and legacy issuer value. The new unique
-- index fails safely if an existing database has ambiguous provider identities;
-- never merge or discard those accounts automatically.
-- https://better-auth.com/docs/guides/1-7-upgrade-guide
BEGIN;
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
ALTER TABLE "Account" ALTER COLUMN "issuer" DROP NOT NULL;
DROP INDEX "Account_issuer_accountId_key";
COMMIT;
