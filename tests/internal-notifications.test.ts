import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { sendInternalMail, type InternalMailTransportFactory } from "../src/lib/internal-mail";
import {
  dispatchInternalNotifications,
  enqueueInternalNotification,
  enqueueNewCustomer,
  notificationLink,
  retryInternalNotification,
  type InternalNotification,
} from "../src/lib/internal-notifications";

test("internal notifications persist safely in an isolated database without sending email", async (t) => {
  const database = new URL(process.env.DATABASE_URL || "");
  assert.ok(["postgres:", "postgresql:"].includes(database.protocol), "Tests require PostgreSQL");
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname), "Tests require local PostgreSQL");
  const schema = `seqforge_mail_test_${randomUUID().replaceAll("-", "")}`;
  database.searchParams.set("schema", schema);
  assert.match(schema, /^seqforge_mail_test_[a-f0-9]{32}$/);
  const db = new PrismaClient({ datasourceUrl: database.toString() });
  const savedEnvironment = { ...process.env };
  const mailEnvironment = {
    INTERNAL_MAIL_MODE: "preview",
    INTERNAL_MAIL_TO: "staff@example.invalid",
    INTERNAL_MAIL_FROM: "notifications@example.invalid",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "465",
    SMTP_USER: "test-user",
    SMTP_PASSWORD: "test-password-never-used",
    BETTER_AUTH_URL: "http://localhost:43210",
    NODE_ENV: "development",
  };
  Object.assign(process.env, mailEnvironment);
  // Every dispatch below injects a fake sender or transport; no SMTP connection is made.
  delete process.env.SEQFORGE_SMOKE_SCHEMA;
  const errorLog = t.mock.method(console, "error", () => undefined);
  const readNotification = async (id: string) => {
    const rows = await db.$queryRaw<InternalNotification[]>`SELECT * FROM "InternalNotification" WHERE "id" = ${id}`;
    assert.equal(rows.length, 1);
    return rows[0];
  };
  const enqueue = (key: string = randomUUID()) => enqueueInternalNotification(db, {
    eventKey: key, kind: "NEW_ORDER", subject: "New test order", text: "An isolated notification fixture.",
  });
  const clearQueue = () => db.$executeRaw`DELETE FROM "InternalNotification"`;

  try {
    await t.test("notification links never break orders and support local and hosted origins", () => {
      for (const base of ["http://192.168.1.50:3000", "https://portal.example.test"]) {
        process.env.BETTER_AUTH_URL = base;
        assert.equal(notificationLink("/admin/orders/order-1"), `${base}/admin/orders/order-1`);
      }
      for (const base of ["broken", "https://user:private@example.test", "file:///tmp/secret"]) {
        process.env.BETTER_AUTH_URL = base;
        assert.equal(notificationLink("/admin/orders/order-1"), "Open the SeqForge admin portal to review this record.");
      }
      process.env.BETTER_AUTH_URL = mailEnvironment.BETTER_AUTH_URL;
      assert.match(notificationLink("/admin/orders/order-1"), /Local testing/);
    });
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: database.toString(), INTERNAL_MAIL_MODE: "off" },
      stdio: "pipe",
      windowsHide: true,
    });

    await t.test("duplicate events create exactly one durable notification", async () => {
      process.env.INTERNAL_MAIL_MODE = "preview";
      const key = `order:${randomUUID()}`;
      const ids = await Promise.all(Array.from({ length: 12 }, () => enqueue(key)));
      assert.equal(ids.filter(Boolean).length, 1);
      const rows = await db.$queryRaw<InternalNotification[]>`SELECT * FROM "InternalNotification" WHERE "eventKey" = ${key}`;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].recipient, mailEnvironment.INTERNAL_MAIL_TO);
      assert.equal(rows[0].status, "PREVIEW");
      assert.equal(rows[0].attempts, 0);
      await clearQueue();
    });

    await t.test("preview messages never send or become live after configuration changes", async () => {
      process.env.INTERNAL_MAIL_MODE = "preview";
      const id = await enqueue();
      assert.ok(id);
      let sent = 0;
      const sender: typeof sendInternalMail = async () => { sent++; return { status: "accepted", messageId: "fake" }; };
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 0, failed: 0 });
      process.env.INTERNAL_MAIL_MODE = "smtp";
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 0, failed: 0 });
      await assert.rejects(retryInternalNotification(db, id), /Preview and sent messages cannot be replayed/);
      assert.equal(sent, 0);
      assert.equal((await readNotification(id)).status, "PREVIEW");
      assert.equal((await readNotification(id)).attempts, 0);
      process.env.INTERNAL_MAIL_MODE = "off";
      assert.equal(await enqueue(), null);
      await clearQueue();
    });

    await t.test("concurrent dispatchers claim each pending event exactly once", async () => {
      process.env.INTERNAL_MAIL_MODE = "smtp";
      const ids = await Promise.all(Array.from({ length: 16 }, () => enqueue()));
      assert.ok(ids.every(Boolean));
      const sent: string[] = [];
      const sender: typeof sendInternalMail = async (message, config) => {
        assert.equal(message.recipient, mailEnvironment.INTERNAL_MAIL_TO);
        assert.equal(config.recipient, mailEnvironment.INTERNAL_MAIL_TO);
        sent.push(message.id);
        await new Promise(resolve => setTimeout(resolve, 5));
        return { status: "accepted", messageId: `fake-${message.id}` };
      };
      const outcomes = await Promise.all(Array.from({ length: 4 }, () => dispatchInternalNotifications(db, 20, sender)));
      assert.equal(outcomes.reduce((sum, outcome) => sum + outcome.accepted, 0), 16);
      assert.equal(outcomes.reduce((sum, outcome) => sum + outcome.failed, 0), 0);
      assert.equal(sent.length, 16);
      assert.equal(new Set(sent).size, 16);
      for (const id of ids) {
        assert.ok(id);
        const row = await readNotification(id);
        assert.equal(row.status, "SENT");
        assert.equal(row.attempts, 1);
        assert.ok(row.sentAt);
        assert.equal(row.claimToken, null);
        assert.equal(row.lockedUntil, null);
      }
      await clearQueue();
    });

    await t.test("failed delivery remains durable and requires explicit retry", async () => {
      process.env.INTERNAL_MAIL_MODE = "smtp";
      const id = await enqueue();
      assert.ok(id);
      let calls = 0;
      const failingSender: typeof sendInternalMail = async () => {
        calls++;
        throw Object.assign(new Error("secret provider failure that must not be stored"), { code: "EAUTH" });
      };
      assert.deepEqual(await dispatchInternalNotifications(db, 5, failingSender), { accepted: 0, failed: 1 });
      const secondConnection = new PrismaClient({ datasourceUrl: database.toString() });
      try {
        const [row] = await secondConnection.$queryRaw<InternalNotification[]>`SELECT * FROM "InternalNotification" WHERE "id" = ${id}`;
        assert.equal(row.status, "FAILED");
        assert.equal(row.lastError, "AUTH_FAILED");
        assert.equal(row.attempts, 1);
        assert.equal(row.sentAt, null);
        assert.equal(row.claimToken, null);
      } finally { await secondConnection.$disconnect(); }
      assert.deepEqual(await dispatchInternalNotifications(db, 5, failingSender), { accepted: 0, failed: 0 });
      assert.equal(calls, 1);
      await retryInternalNotification(db, id);
      assert.equal((await readNotification(id)).status, "PENDING");
      const sender: typeof sendInternalMail = async () => { calls++; return { status: "accepted", messageId: "fake-retry" }; };
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 1, failed: 0 });
      assert.equal(calls, 2);
      assert.equal((await readNotification(id)).attempts, 2);
      assert.equal((await readNotification(id)).lastError, null);
      await assert.rejects(retryInternalNotification(db, id), /cannot be replayed/);
      await clearQueue();
    });

    await t.test("abandoned sends are not silently resent and active leases cannot be retried", async () => {
      process.env.INTERNAL_MAIL_MODE = "smtp";
      const expiredId = await enqueue();
      const activeId = await enqueue();
      assert.ok(expiredId && activeId);
      await db.$executeRaw`UPDATE "InternalNotification" SET "status" = 'SENDING', "attempts" = 1,
        "claimToken" = 'expired-test-claim', "lockedUntil" = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE "id" = ${expiredId}`;
      await db.$executeRaw`UPDATE "InternalNotification" SET "status" = 'SENDING', "attempts" = 1,
        "claimToken" = 'active-test-claim', "lockedUntil" = CURRENT_TIMESTAMP + INTERVAL '1 minute' WHERE "id" = ${activeId}`;
      const sent: string[] = [];
      const sender: typeof sendInternalMail = async message => {
        sent.push(message.id);
        return { status: "accepted", messageId: "fake-recovered" };
      };
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 0, failed: 0 });
      assert.deepEqual(sent, []);
      await assert.rejects(retryInternalNotification(db, activeId), /No retryable message/);
      await retryInternalNotification(db, expiredId);
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 1, failed: 0 });
      assert.deepEqual(sent, [expiredId]);
      assert.equal((await readNotification(expiredId)).attempts, 2);
      assert.equal((await readNotification(activeId)).status, "SENDING");
      await clearQueue();
    });

    await t.test("changing recipient never retargets an already queued notification", async () => {
      process.env.INTERNAL_MAIL_MODE = "smtp";
      process.env.INTERNAL_MAIL_TO = mailEnvironment.INTERNAL_MAIL_TO;
      const id = await enqueue();
      assert.ok(id);
      process.env.INTERNAL_MAIL_TO = "replacement@example.invalid";
      let transportCreated = 0;
      const capturedRecipients: string[] = [];
      const factory: InternalMailTransportFactory = options => {
        transportCreated++;
        assert.equal(options.host, "smtp.example.invalid");
        return {
          async sendMail(options) {
            assert.equal(options.cc, undefined);
            assert.equal(options.bcc, undefined);
            assert.equal(options.to, mailEnvironment.INTERNAL_MAIL_TO);
            assert.deepEqual(options.envelope, { from: mailEnvironment.INTERNAL_MAIL_FROM, to: [mailEnvironment.INTERNAL_MAIL_TO] });
            capturedRecipients.push(String(options.to));
            return { accepted: [mailEnvironment.INTERNAL_MAIL_TO], rejected: [] };
          },
          close() {},
        };
      };
      const sender: typeof sendInternalMail = (message, config) => sendInternalMail(message, config, factory);
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 0, failed: 1 });
      assert.equal(transportCreated, 0);
      assert.equal((await readNotification(id)).recipient, mailEnvironment.INTERNAL_MAIL_TO);
      assert.equal((await readNotification(id)).lastError, "RECIPIENT_CHANGED");
      await assert.rejects(retryInternalNotification(db, id), /No retryable message/);
      process.env.INTERNAL_MAIL_TO = mailEnvironment.INTERNAL_MAIL_TO;
      await retryInternalNotification(db, id);
      assert.deepEqual(await dispatchInternalNotifications(db, 5, sender), { accepted: 1, failed: 0 });
      assert.equal(transportCreated, 1);
      assert.deepEqual(capturedRecipients, [mailEnvironment.INTERNAL_MAIL_TO]);
      await clearQueue();
    });

    await t.test("customer notification failures do not turn saved signup into an error", async () => {
      process.env.INTERNAL_MAIL_MODE = "preview";
      const user = { id: "isolated-customer", name: "Test Customer", email: "customer@example.invalid", role: "customer", emailVerified: false };
      const unavailableDb = {
        $queryRaw: () => Promise.reject(new Error("Private database details")),
        $executeRaw: () => Promise.reject(new Error("Private database details")),
      } as unknown as Parameters<typeof enqueueNewCustomer>[0];
      await assert.doesNotReject(enqueueNewCustomer(unavailableDb, user));
      assert.ok(errorLog.mock.calls.some(call => call.arguments[0] === "New customer notification could not be queued; review Customers in the admin portal."));
      assert.ok(!JSON.stringify(errorLog.mock.calls.map(call => call.arguments)).includes("Private database details"));
      await enqueueNewCustomer(db, user);
      await enqueueNewCustomer(db, user);
      await enqueueNewCustomer(db, { ...user, id: "isolated-admin", role: "admin" });
      const rows = await db.$queryRaw<InternalNotification[]>`SELECT * FROM "InternalNotification"`;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, "NEW_CUSTOMER");
      assert.equal(rows[0].eventKey, "customer:isolated-customer");
      assert.equal(rows[0].recipient, mailEnvironment.INTERNAL_MAIL_TO);
      assert.match(rows[0].bodyText, /Email verified: No/);
      assert.match(rows[0].bodyText, /Local testing: this link opens only on the computer running SeqForge/);
    });
  } finally {
    try {
      assert.match(schema, /^seqforge_mail_test_[a-f0-9]{32}$/);
      assert.equal(database.searchParams.get("schema"), schema);
      assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await db.$disconnect();
      for (const key of [...Object.keys(mailEnvironment), "SEQFORGE_SMOKE_SCHEMA"]) {
        if (savedEnvironment[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnvironment[key];
      }
      errorLog.mock.restore();
    }
  }
});
