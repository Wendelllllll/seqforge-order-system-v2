import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { sendInternalMail, type InternalMailTransportFactory } from "../src/lib/internal-mail";
import { dispatchCustomerNotifications, enqueueCustomerNotification, type CustomerNotification } from "../src/lib/customer-notifications";
import { type sendCustomerMail } from "../src/lib/customer-mail";
import { OrderStatusError, setOrderStatus } from "../src/lib/order-status";
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
    CUSTOMER_MAIL_MODE: "smtp",
    CUSTOMER_MAIL_FROM: "notifications@example.invalid",
    CUSTOMER_MAIL_ALLOWED_RECIPIENTS: "customer@example.invalid",
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

    for (const timezone of ["America/Los_Angeles", "UTC"]) {
      await t.test(`customer verification expiry uses database time in ${timezone}`, async () => {
        await db.$transaction(async tx => {
          await tx.$executeRaw`SELECT set_config('TimeZone', ${timezone}, true)`;
          const [settings] = await tx.$queryRaw<{ timezone: string }[]>`SELECT current_setting('TimeZone') AS timezone`;
          assert.equal(settings.timezone, timezone);

          const sent: string[] = [];
          const sender: typeof sendCustomerMail = async message => {
            sent.push(message.id);
            return { status: "accepted", messageId: "fake-customer-message" };
          };
          for (const scenario of [
            { name: "future", kind: "VERIFY_EMAIL", expiresAt: new Date(Date.now() + 60 * 60 * 1000), expired: false },
            { name: "past", kind: "VERIFY_EMAIL", expiresAt: new Date(Date.now() - 60 * 60 * 1000), expired: true },
            { name: "no expiry", kind: "ORDER_CONFIRMATION", expiresAt: undefined, expired: false },
          ] as const) {
            const id = await enqueueCustomerNotification(tx, {
              eventKey: `timezone:${randomUUID()}`, userId: "isolated-customer", kind: scenario.kind,
              recipient: "customer@example.invalid", subject: `Isolated ${scenario.name} notification`,
              text: "An isolated notification fixture.", expiresAt: scenario.expiresAt,
            });
            assert.ok(id);
            const sentBefore = sent.length;
            assert.deepEqual(await dispatchCustomerNotifications(tx, 1, sender, id), {
              accepted: scenario.expired ? 0 : 1,
              failed: scenario.expired ? 1 : 0,
            });
            assert.equal(sent.length, sentBefore + (scenario.expired ? 0 : 1));
            if (!scenario.expired) assert.equal(sent.at(-1), id);
            const [row] = await tx.$queryRaw<{ status: string; lastError: string | null; attempts: number }[]>`
              SELECT "status", "lastError", "attempts" FROM "CustomerNotification" WHERE "id" = ${id}`;
            assert.equal(row.status, scenario.expired ? "FAILED" : "SENT");
            assert.equal(row.lastError, scenario.expired ? "VERIFICATION_EXPIRED" : null);
            assert.equal(row.attempts, 1);
            assert.deepEqual(await dispatchCustomerNotifications(tx, 1, sender, id), { accepted: 0, failed: 0 });
            assert.equal(sent.length, sentBefore + (scenario.expired ? 0 : 1));
          }
        });
      });
    }

    await t.test("result release is atomic, requires a file and notifies only the ordering customer once", async () => {
      process.env.CUSTOMER_MAIL_MODE = "preview";
      await db.$executeRaw`DELETE FROM "CustomerNotification"`;
      const resultMessages = () => db.$queryRaw<CustomerNotification[]>`SELECT * FROM "CustomerNotification"`;
      const resultMessage = async (orderId: string) => {
        const message = (await resultMessages()).find(row => row.eventKey === `result-ready:${orderId}`);
        assert.ok(message);
        return message;
      };
      const messageCount = async (orderId?: string) => (await resultMessages()).filter(row => !orderId || row.eventKey === `result-ready:${orderId}`).length;
      const customer = await db.user.create({ data: {
        id: randomUUID(), name: "Result Customer", email: "customer@example.invalid", emailVerified: true,
        firstName: "Result", lastName: "Customer", organization: "Isolated tests", labName: "Isolated lab",
      } });
      const makeOrder = (service = "SANGER", status = "QC", withFile = true) => db.order.create({ data: {
        userId: customer.id, orderNumber: `TEST-${randomUUID()}`, orderName: "Private sample names must not appear in mail", service, status,
        fulfillmentSnapshot: { billingEmail: "billing@example.invalid", sharedResultEmails: ["colleague@example.invalid"] },
        ...(withFile ? { result: { create: { originalName: "private-sequences.fasta", storedName: `${randomUUID()}.fasta`, mimeType: "text/plain", size: 10 } } } : {}),
      } });
      const withoutFile = await makeOrder("SANGER", "QC", false);
      await assert.rejects(setOrderStatus(db, withoutFile.id, "COMPLETED"), error => error instanceof OrderStatusError && error.status === 409);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: withoutFile.id } })).status, "QC");
      assert.equal(await messageCount(), 0);

      const oligo = await makeOrder("OLIGO", "RECEIVED", false);
      await assert.rejects(setOrderStatus(db, oligo.id, "COMPLETED"), error => error instanceof OrderStatusError && error.status === 409);

      const historical = await makeOrder("WHOLE_PLASMID", "COMPLETED");
      assert.deepEqual(await setOrderStatus(db, historical.id, "COMPLETED"), { status: "COMPLETED", changed: false, revision: 0 });
      assert.equal(await messageCount(), 0, "Existing completed orders are not backfilled");

      const order = await makeOrder();
      process.env.BETTER_AUTH_URL = "invalid origin";
      await assert.rejects(setOrderStatus(db, order.id, "COMPLETED"));
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status, "QC", "Enqueue failure rolls back the status");
      assert.equal(await db.statusHistory.count({ where: { orderId: order.id } }), 0);
      assert.equal(await messageCount(), 0);
      process.env.BETTER_AUTH_URL = "https://portal.example.test";

      const changes = await Promise.all(Array.from({ length: 8 }, () => setOrderStatus(db, order.id, "COMPLETED")));
      assert.equal(changes.filter(result => result.changed).length, 1);
      const message = await resultMessage(order.id);
      assert.equal(message.kind, "RESULT_READY");
      assert.equal(message.userId, customer.id);
      assert.equal(message.recipient, customer.email);
      assert.equal(message.status, "PREVIEW");
      assert.match(message.bodyText, /Sanger sequencing/);
      assert.ok(message.bodyText.includes(order.orderNumber));
      assert.ok(message.bodyText.includes(`https://portal.example.test/orders/${order.id}`));
      for (const privateValue of ["billing@example.invalid", "colleague@example.invalid", order.orderName, "private-sequences.fasta"]) assert.ok(!message.bodyText.includes(privateValue));
      assert.equal(await db.statusHistory.count({ where: { orderId: order.id, status: "COMPLETED" } }), 1);
      await setOrderStatus(db, order.id, "QC");
      await setOrderStatus(db, order.id, "COMPLETED");
      assert.equal(await messageCount(order.id), 1, "Reopening and completing does not resend");

      process.env.CUSTOMER_MAIL_MODE = "smtp";
      let sends = 0;
      const sender: typeof sendCustomerMail = async mail => {
        sends++;
        assert.equal(mail.recipient, customer.email);
        return { status: "accepted", messageId: "fake-results-ready" };
      };
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, sender), { accepted: 0, failed: 0 }, "Preview messages never become live mail");
      const wholePlasmid = await makeOrder("WHOLE_PLASMID");
      await setOrderStatus(db, wholePlasmid.id, "COMPLETED");
      const wholeMail = await resultMessage(wholePlasmid.id);
      assert.match(wholeMail.bodyText, /Whole Plasmid Sequencing/);
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, sender), { accepted: 1, failed: 0 }, "The regular dispatcher includes result-ready notifications");
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, sender), { accepted: 0, failed: 0 });
      assert.equal(sends, 1);

      const failedDeliveryOrder = await makeOrder();
      await setOrderStatus(db, failedDeliveryOrder.id, "COMPLETED");
      const failingSender: typeof sendCustomerMail = async () => { throw new Error("Fake SMTP outage"); };
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, failingSender), { accepted: 0, failed: 1 });
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: failedDeliveryOrder.id } })).status, "COMPLETED", "SMTP failure does not roll back a released result");
      assert.equal((await resultMessage(failedDeliveryOrder.id)).status, "FAILED");
      await setOrderStatus(db, failedDeliveryOrder.id, "COMPLETED");
      assert.equal(await messageCount(failedDeliveryOrder.id), 1);

      const withdrawnOrder = await makeOrder();
      await setOrderStatus(db, withdrawnOrder.id, "COMPLETED");
      const pendingResult = await resultMessage(withdrawnOrder.id);
      const actor = { id: "isolated-result-admin", name: "Result reviewer" };
      await setOrderStatus(db, withdrawnOrder.id, "ON_HOLD", { reason: "The file needs another review. Please wait for a lab update.", expectedRevision: 1, requestKey: randomUUID(), actor });
      const dispatched: string[] = [];
      const heldSender: typeof sendCustomerMail = async message => { dispatched.push(message.id); return { status: "accepted", messageId: "fake-held-result" }; };
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, heldSender), { accepted: 1, failed: 0 }, "The hold notification can send while result-ready remains paused");
      assert.ok(!dispatched.includes(pendingResult.id));
      assert.equal((await resultMessage(withdrawnOrder.id)).status, "PENDING");
      await setOrderStatus(db, withdrawnOrder.id, "QC", { reason: "The hold is resolved. QC review continues.", expectedRevision: 2, requestKey: randomUUID(), actor });
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, heldSender), { accepted: 1, failed: 0 }, "Resolution does not send a result-ready email before release");
      assert.ok(!dispatched.includes(pendingResult.id));
      await setOrderStatus(db, withdrawnOrder.id, "COMPLETED");
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, heldSender), { accepted: 1, failed: 0 });
      assert.equal(dispatched.filter(id => id === pendingResult.id).length, 1, "Recompletion dispatches the original pending result notification once");
      assert.equal((await resultMessage(withdrawnOrder.id)).status, "SENT");
      assert.equal(await messageCount(withdrawnOrder.id), 1);
      process.env.BETTER_AUTH_URL = mailEnvironment.BETTER_AUTH_URL;
    });

    await t.test("order holds require customer instructions, preserve data and have audited idempotent resolution", async () => {
      process.env.CUSTOMER_MAIL_MODE = "smtp";
      process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS = "exception@example.invalid";
      await db.$executeRaw`DELETE FROM "CustomerNotification"`;
      const customer = await db.user.create({ data: {
        id: randomUUID(), name: "Exception Customer", email: "exception@example.invalid", emailVerified: true,
        firstName: "Exception", lastName: "Customer", organization: "Isolated tests", labName: "Isolated lab",
      } });
      const actor = { id: "isolated-lab-admin", name: "Lab administrator" };
      const order = await db.order.create({ data: {
        userId: customer.id, orderNumber: `HOLD-${randomUUID()}`, orderName: "Unchanged order", status: "QC",
        pricingSnapshot: { subtotalCents: 550 }, fulfillmentSnapshot: { billingEmail: "billing@example.invalid" },
        samples: { create: { position: 0, sampleName: "Unchanged sample", templateType: "Plasmid DNA", primerName: "T7", primerSource: "Customer supplied" } },
        result: { create: { originalName: "private-result.txt", storedName: `${randomUUID()}.txt`, mimeType: "text/plain", size: 10 } },
      } });
      const options = { reason: "Tube A label does not match the order. Please confirm the correct sample name with the lab.", expectedRevision: 0, requestKey: randomUUID(), actor };
      await assert.rejects(setOrderStatus(db, order.id, "ON_HOLD"), error => error instanceof OrderStatusError && error.status === 400);
      await assert.rejects(setOrderStatus(db, order.id, "ON_HOLD", { ...options, reason: "   " }), error => error instanceof OrderStatusError && error.status === 400);
      await assert.rejects(setOrderStatus(db, order.id, "ON_HOLD", { ...options, expectedRevision: 2 }), error => error instanceof OrderStatusError && error.status === 409);
      assert.equal(await db.statusHistory.count({ where: { orderId: order.id } }), 0);

      const held = await Promise.all(Array.from({ length: 6 }, () => setOrderStatus(db, order.id, "ON_HOLD", options)));
      assert.equal(held.filter(result => result.changed).length, 1);
      assert.ok(held.every(result => result.status === "ON_HOLD" && result.revision === 1));
      const saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { samples: true, statusHistory: true } });
      assert.equal(saved.holdReason, options.reason);
      assert.equal(saved.holdPreviousStatus, "QC");
      assert.deepEqual(saved.pricingSnapshot, { subtotalCents: 550 });
      assert.equal(saved.samples[0].sampleName, "Unchanged sample");
      assert.equal(saved.statusHistory.length, 1);
      assert.equal(saved.statusHistory[0].actorId, actor.id);
      assert.equal(saved.statusHistory[0].actorName, actor.name);
      assert.equal(saved.statusHistory[0].previousStatus, "QC");
      assert.equal(saved.statusHistory[0].note, options.reason);
      await assert.rejects(setOrderStatus(db, order.id, "ON_HOLD", { ...options, reason: "Different instructions" }), error => error instanceof OrderStatusError && error.status === 409);
      await assert.rejects(setOrderStatus(db, order.id, "COMPLETED", { ...options, expectedRevision: 1, requestKey: randomUUID() }), error => error instanceof OrderStatusError && error.status === 409);
      await assert.rejects(setOrderStatus(db, order.id, "QC"), error => error instanceof OrderStatusError && error.status === 400);

      const updates = await Promise.allSettled(["Please send a photo of the tube label.", "Please confirm the sample ID by email."].map(reason =>
        setOrderStatus(db, order.id, "ON_HOLD", { reason, expectedRevision: 1, requestKey: randomUUID(), actor })));
      assert.equal(updates.filter(result => result.status === "fulfilled").length, 1);
      const staleUpdate = updates.find(result => result.status === "rejected");
      assert.ok(staleUpdate?.status === "rejected" && staleUpdate.reason instanceof OrderStatusError && staleUpdate.reason.status === 409);
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).holdPreviousStatus, "QC", "Editing the message preserves the original working stage");

      const resolve = { reason: "The sample name has been confirmed. The lab will continue its review.", expectedRevision: 2, requestKey: randomUUID(), actor };
      assert.deepEqual(await setOrderStatus(db, order.id, "QC", resolve), { status: "QC", changed: true, revision: 3 });
      assert.deepEqual(await setOrderStatus(db, order.id, "QC", resolve), { status: "QC", changed: false, revision: 3 });
      assert.deepEqual(await setOrderStatus(db, order.id, "ON_HOLD", options), { status: "QC", changed: false, revision: 3 }, "A delayed retry cannot reopen the resolved hold");
      const resumed = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { statusHistory: true } });
      assert.equal(resumed.holdReason, null);
      assert.equal(resumed.holdPreviousStatus, null);
      assert.equal(resumed.statusHistory.length, 3);

      const messages = await db.$queryRaw<CustomerNotification[]>`SELECT * FROM "CustomerNotification" ORDER BY "createdAt"`;
      assert.equal(messages.filter(message => message.kind === "ORDER_ATTENTION").length, 2);
      assert.equal(messages.filter(message => message.kind === "ORDER_RESUMED").length, 1);
      for (const message of messages) {
        assert.equal(message.recipient, customer.email);
        assert.equal(message.userId, customer.id);
        assert.ok(message.bodyText.includes(order.orderNumber));
        assert.ok(message.bodyText.includes(`/orders/${order.id}`));
        assert.ok(!message.bodyText.includes("billing@example.invalid"));
        assert.ok(!message.bodyText.includes("private-result.txt"));
      }
      const sends: string[] = [];
      const sender: typeof sendCustomerMail = async message => { sends.push(message.id); return { status: "accepted", messageId: "fake-attention" }; };
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, sender), { accepted: 3, failed: 0 });
      assert.deepEqual(await dispatchCustomerNotifications(db, 20, sender), { accepted: 0, failed: 0 });
      assert.equal(new Set(sends).size, 3);

      await setOrderStatus(db, order.id, "COMPLETED");
      const completed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      await setOrderStatus(db, order.id, "ON_HOLD", { reason: "A result needs a further check. Please wait for the lab update.", expectedRevision: completed.statusRevision, requestKey: randomUUID(), actor });
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).holdPreviousStatus, "QC", "A hold on a published order resumes at QC, never directly at Completed");

      for (const service of ["WHOLE_PLASMID", "OLIGO"]) {
        const other = await db.order.create({ data: { userId: customer.id, orderNumber: `HOLD-${randomUUID()}`, orderName: "Service hold", service, status: "RECEIVED" } });
        await setOrderStatus(db, other.id, "ON_HOLD", { ...options, requestKey: randomUUID() });
        if (service === "OLIGO") await assert.rejects(setOrderStatus(db, other.id, "PROCESSING", { ...resolve, expectedRevision: 1, requestKey: randomUUID() }), error => error instanceof OrderStatusError && error.status === 409);
        await setOrderStatus(db, other.id, "RECEIVED", { ...resolve, expectedRevision: 1, requestKey: randomUUID() });
        assert.equal((await db.order.findUniqueOrThrow({ where: { id: other.id } })).status, "RECEIVED");
      }
      process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS = mailEnvironment.CUSTOMER_MAIL_ALLOWED_RECIPIENTS;
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
