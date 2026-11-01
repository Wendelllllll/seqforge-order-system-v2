import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const migration = path.join(process.cwd(), "prisma/migrations/20261101223000_auth_provider_account_identity/migration.sql");

async function withLegacyAccounts(run: (db: PrismaClient, migrate: () => void) => Promise<void>) {
  const database = new URL(process.env.DATABASE_URL || "");
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname), "Auth migration tests require local PostgreSQL");
  const schema = `seqforge_auth_test_${randomUUID().replaceAll("-", "")}`;
  database.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: database.toString() });
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    // Only the legacy account columns/index touched by this migration are needed.
    await db.$executeRawUnsafe(`CREATE TABLE "Account" (
      "id" TEXT PRIMARY KEY, "issuer" TEXT NOT NULL, "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL, "userId" TEXT NOT NULL, "password" TEXT
    )`);
    await db.$executeRawUnsafe('CREATE UNIQUE INDEX "Account_issuer_accountId_key" ON "Account"("issuer", "accountId")');
    const migrate = () => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--schema", "prisma/schema.prisma", "--file", migration], {
      env: { ...process.env, DATABASE_URL: database.toString() }, stdio: "pipe", windowsHide: true,
    });
    await run(db, migrate);
  } finally {
    assert.match(schema, /^seqforge_auth_test_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
}

test("auth upgrade preserves legacy account ownership and credentials while accepting new accounts without issuer", async () => {
  await withLegacyAccounts(async (db, migrate) => {
    await db.$executeRaw`INSERT INTO "Account" VALUES ('legacy', 'local:credential', 'user-1', 'credential', 'user-1', 'synthetic-existing-password-hash')`;
    migrate();
    const legacy = await db.$queryRaw<{ issuer: string; userId: string; password: string }[]>`SELECT "issuer", "userId", "password" FROM "Account" WHERE "id" = 'legacy'`;
    assert.deepEqual(legacy, [{ issuer: "local:credential", userId: "user-1", password: "synthetic-existing-password-hash" }]);
    await db.$executeRaw`INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "password") VALUES ('new', 'user-2', 'credential', 'user-2', 'synthetic-new-password-hash')`;
    await db.$executeRaw`INSERT INTO "Account" ("id", "accountId", "providerId", "userId") VALUES ('other-provider', 'user-2', 'another-provider', 'user-2')`;
    await assert.rejects(db.$executeRaw`INSERT INTO "Account" ("id", "accountId", "providerId", "userId") VALUES ('duplicate', 'user-2', 'credential', 'wrong-user')`);
    const rows = await db.$queryRaw<{ issuer: string | null }[]>`SELECT "issuer" FROM "Account" WHERE "id" = 'new'`;
    assert.equal(rows[0].issuer, null);
  });
});

test("ambiguous provider identities abort the auth upgrade without changing existing accounts or constraints", async () => {
  await withLegacyAccounts(async (db, migrate) => {
    await db.$executeRaw`INSERT INTO "Account" VALUES ('first', 'issuer-a', 'shared-id', 'provider', 'first-user', 'first-hash'), ('second', 'issuer-b', 'shared-id', 'provider', 'second-user', 'second-hash')`;
    assert.throws(migrate, error => error instanceof Error && "stderr" in error && /P2002[\s\S]*providerId[\s\S]*accountId/.test(String(error.stderr)));
    const rows = await db.$queryRaw<{ id: string; userId: string; password: string }[]>`SELECT "id", "userId", "password" FROM "Account" ORDER BY "id"`;
    assert.deepEqual(rows, [{ id: "first", userId: "first-user", password: "first-hash" }, { id: "second", userId: "second-user", password: "second-hash" }]);
    await assert.rejects(db.$executeRaw`INSERT INTO "Account" ("id", "accountId", "providerId", "userId") VALUES ('missing-issuer', 'new', 'provider', 'new-user')`);
    await assert.rejects(db.$executeRaw`INSERT INTO "Account" VALUES ('old-index-still-active', 'issuer-a', 'shared-id', 'different-provider', 'new-user', 'new-hash')`);
  });
});
