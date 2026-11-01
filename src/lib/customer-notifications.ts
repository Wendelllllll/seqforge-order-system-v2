import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { CustomerMailError, customerMailErrorCode, customerRecipientAllowed, getCustomerMailConfig, sendCustomerMail } from "./customer-mail";

type NotificationDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type CustomerNotification = {
  id: string; eventKey: string; userId: string; kind: string; recipient: string; subject: string;
  bodyText: string; status: string; attempts: number; lastError: string | null;
  claimToken: string | null; lockedUntil: Date | null; expiresAt: Date | null; createdAt: Date;
};
type Content = { eventKey: string; userId: string; kind: "VERIFY_EMAIL" | "ORDER_CONFIRMATION" | "RESULT_READY" | "ORDER_ATTENTION" | "ORDER_RESUMED"; recipient: string; subject: string; text: string; expiresAt?: Date };

export class VerificationCooldown extends Error {
  constructor(readonly retryAfter: number) { super("VERIFICATION_COOLDOWN"); }
}

export async function enqueueCustomerNotification(db: NotificationDb, content: Content) {
  let config;
  try { config = getCustomerMailConfig(); }
  catch (error) {
    if (content.kind === "VERIFY_EMAIL") throw error;
    console.error("Customer notification email configuration is unavailable.");
    return null;
  }
  if (config.mode === "off") return null;
  const allowed = customerRecipientAllowed(config, content.recipient);
  if (!allowed && content.kind === "VERIFY_EMAIL") throw new CustomerMailError("RECIPIENT_NOT_ALLOWED");
  const status = config.mode === "preview" ? "PREVIEW" : allowed ? "PENDING" : "SUPPRESSED";
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "CustomerNotification" ("id", "eventKey", "userId", "kind", "recipient", "subject", "bodyText", "status", "expiresAt", "updatedAt")
    VALUES (${randomUUID()}, ${content.eventKey}, ${content.userId}, ${content.kind}, ${content.recipient.toLowerCase()}, ${`[SeqForge] ${content.subject.replace(/[\r\n]/g, " ").slice(0, 160)}`}, ${content.text}, ${status}, ${content.expiresAt ?? null}, CURRENT_TIMESTAMP)
    ON CONFLICT ("eventKey") DO NOTHING RETURNING "id"`;
  return rows[0]?.id ?? null;
}

export async function enqueueEmailVerification(db: PrismaClient, user: { id: string; email: string }, url: string) {
  const config = getCustomerMailConfig();
  if (config.mode === "off") throw new CustomerMailError("MAIL_DISABLED");
  if (!customerRecipientAllowed(config, user.email)) throw new CustomerMailError("RECIPIENT_NOT_ALLOWED");
  const link = new URL(url);
  const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (link.origin !== base.origin || link.pathname !== "/api/auth/verify-email") throw new CustomerMailError("MAIL_CONFIG_INVALID");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`email-verification:${user.id}`}, 0))`;
    const recent = await tx.$queryRaw<{ seconds: number }[]>`
      SELECT CEIL(EXTRACT(EPOCH FROM ("createdAt" + INTERVAL '60 seconds' - CURRENT_TIMESTAMP)))::int AS seconds
      FROM "CustomerNotification" WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL'
      AND "createdAt" > CURRENT_TIMESTAMP - INTERVAL '60 seconds' ORDER BY "createdAt" DESC LIMIT 1`;
    if (recent[0]) throw new VerificationCooldown(Math.max(1, recent[0].seconds));
    return enqueueCustomerNotification(tx, {
      eventKey: `verify:${randomUUID()}`, userId: user.id, kind: "VERIFY_EMAIL", recipient: user.email,
      subject: "Verify your email — your order is waiting",
      text: `One small step before your next discovery.\n\nVerify your email address to finish placing your SeqForge order:\n${link.toString()}\n\nThis link expires in one hour. Your saved order stays in the browser where you started it. Verifying your email does not submit an order.\n\nIf you did not request this, you can ignore this message.`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
  });
}

export async function enqueueResultReady(db: NotificationDb, order: {
  id: string; orderNumber: string; service: string; user: { id: string; email: string };
}) {
  if (order.service === "OLIGO") return null;
  let link: string;
  try {
    const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new Error("Invalid origin");
    link = new URL(`/orders/${encodeURIComponent(order.id)}`, base.origin).toString();
  } catch {
    throw new CustomerMailError("MAIL_CONFIG_INVALID");
  }
  const service = order.service === "WHOLE_PLASMID" ? "Whole Plasmid Sequencing" : "Sanger sequencing";
  return enqueueCustomerNotification(db, {
    eventKey: `result-ready:${order.id}`, userId: order.user.id, kind: "RESULT_READY", recipient: order.user.email,
    subject: `Results ready for ${order.orderNumber}`,
    text: `Your SeqForge results are ready.\n\nOrder: ${order.orderNumber}\nService: ${service}\n\nSign in to your SeqForge account to view and download your results:\n${link}\n\nThis link opens your private order page. Your result files are not attached to this email.`,
  });
}

export async function enqueueOrderAttention(db: NotificationDb, order: {
  id: string; orderNumber: string; user: { id: string; email: string };
}, event: { historyId: string; reason: string; resumed: boolean }) {
  const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password) throw new CustomerMailError("MAIL_CONFIG_INVALID");
  const link = new URL(`/orders/${encodeURIComponent(order.id)}`, base.origin).toString();
  return enqueueCustomerNotification(db, {
    eventKey: `order-attention:${event.historyId}`, userId: order.user.id,
    kind: event.resumed ? "ORDER_RESUMED" : "ORDER_ATTENTION", recipient: order.user.email,
    subject: `${event.resumed ? "Order resumed" : "Action needed"}: ${order.orderNumber}`,
    text: `${event.resumed ? "SeqForge has resolved the hold on your order." : "Your SeqForge order is on hold and needs attention."}\n\nOrder: ${order.orderNumber}\n\n${event.resumed ? "Update from the lab" : "Message and next steps from the lab"}:\n${event.reason}\n\nSign in to review your private order page:\n${link}\n\nIf you contact the lab, please include your order number.`,
  });
}

export async function dispatchCustomerNotifications(db: NotificationDb, limit = 5, sender: typeof sendCustomerMail = sendCustomerMail, onlyId?: string) {
  const config = getCustomerMailConfig();
  if (config.mode !== "smtp") return { accepted: 0, failed: 0 };
  let accepted = 0, failed = 0;
  for (let count = 0; count < Math.min(limit, 20); count++) {
    const token = randomUUID();
    const rows = await db.$queryRaw<(CustomerNotification & { expired: boolean })[]>`
      UPDATE "CustomerNotification" SET "status" = 'SENDING', "attempts" = "attempts" + 1,
        "claimToken" = ${token}, "lockedUntil" = CURRENT_TIMESTAMP + INTERVAL '90 seconds', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (SELECT "id" FROM "CustomerNotification" WHERE "status" = 'PENDING'
        AND (${onlyId ?? null}::text IS NULL OR "id" = ${onlyId ?? null})
        AND (${onlyId ?? null}::text IS NOT NULL OR "kind" IN ('ORDER_CONFIRMATION', 'RESULT_READY', 'ORDER_ATTENTION', 'ORDER_RESUMED'))
        AND ("kind" <> 'RESULT_READY' OR EXISTS (SELECT 1 FROM "Order" o WHERE "CustomerNotification"."eventKey" = 'result-ready:' || o."id" AND o."status" = 'COMPLETED'))
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *, ("expiresAt" IS NOT NULL AND "expiresAt" <= CURRENT_TIMESTAMP) AS "expired"`;
    const item = rows[0];
    if (!item) break;
    try {
      // Compare timestamp-without-time-zone values in the database's timezone.
      // Prisma decodes those values as UTC, which can make fresh links look expired.
      if (item.expired) throw new CustomerMailError("VERIFICATION_EXPIRED");
      await sender({ id: item.id, recipient: item.recipient, subject: item.subject, text: item.bodyText }, config);
      await db.$executeRaw`UPDATE "CustomerNotification" SET "status" = 'SENT', "sentAt" = CURRENT_TIMESTAMP,
        "claimToken" = NULL, "lockedUntil" = NULL, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${item.id} AND "claimToken" = ${token}`;
      accepted++;
    } catch (error) {
      await db.$executeRaw`UPDATE "CustomerNotification" SET "status" = 'FAILED', "lastError" = ${customerMailErrorCode(error)},
        "claimToken" = NULL, "lockedUntil" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${item.id} AND "claimToken" = ${token}`;
      failed++;
    }
  }
  return { accepted, failed };
}

export async function safeDispatchCustomerNotifications(db: PrismaClient) {
  try { await dispatchCustomerNotifications(db); }
  catch { console.error("Customer email queue could not be processed. Orders remain saved."); }
}
