import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { CustomerMailError, customerMailErrorCode, customerRecipientAllowed, getCustomerMailConfig, sendCustomerMail } from "./customer-mail";

type NotificationDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type CustomerNotification = {
  id: string; eventKey: string; userId: string; kind: string; recipient: string; subject: string;
  bodyText: string; status: string; attempts: number; lastError: string | null;
  claimToken: string | null; lockedUntil: Date | null; expiresAt: Date | null; createdAt: Date;
};
type Content = { eventKey: string; userId: string; kind: "VERIFY_EMAIL" | "ORDER_CONFIRMATION"; recipient: string; subject: string; text: string; expiresAt?: Date };

export class VerificationCooldown extends Error {
  constructor(readonly retryAfter: number) { super("VERIFICATION_COOLDOWN"); }
}

export async function enqueueCustomerNotification(db: NotificationDb, content: Content) {
  let config;
  try { config = getCustomerMailConfig(); }
  catch (error) {
    if (content.kind === "VERIFY_EMAIL") throw error;
    console.error("Customer confirmation email configuration is unavailable.");
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

export async function dispatchCustomerNotifications(db: NotificationDb, limit = 5, sender: typeof sendCustomerMail = sendCustomerMail, onlyId?: string) {
  const config = getCustomerMailConfig();
  if (config.mode !== "smtp") return { accepted: 0, failed: 0 };
  let accepted = 0, failed = 0;
  for (let count = 0; count < Math.min(limit, 20); count++) {
    const token = randomUUID();
    const rows = await db.$queryRaw<CustomerNotification[]>`
      UPDATE "CustomerNotification" SET "status" = 'SENDING', "attempts" = "attempts" + 1,
        "claimToken" = ${token}, "lockedUntil" = CURRENT_TIMESTAMP + INTERVAL '90 seconds', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (SELECT "id" FROM "CustomerNotification" WHERE "status" = 'PENDING'
        AND (${onlyId ?? null}::text IS NULL OR "id" = ${onlyId ?? null})
        AND (${onlyId ?? null}::text IS NOT NULL OR "kind" = 'ORDER_CONFIRMATION')
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
    const item = rows[0];
    if (!item) break;
    try {
      if (item.expiresAt && item.expiresAt <= new Date()) throw new CustomerMailError("VERIFICATION_EXPIRED");
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
