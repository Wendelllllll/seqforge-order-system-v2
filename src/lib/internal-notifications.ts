import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import { getInternalMailConfig, internalMailErrorCode, sendInternalMail } from "./internal-mail";

type NotificationDb = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
export type InternalNotification = {
  id: string; eventKey: string; kind: string; recipient: string; subject: string;
  bodyText: string; status: string; attempts: number; lastError: string | null;
  claimToken: string | null; lockedUntil: Date | null; sentAt: Date | null; createdAt: Date;
};
type NotificationContent = { eventKey: string; kind: "NEW_ORDER" | "NEW_CUSTOMER" | "TEST"; subject: string; text: string };

function configuredMail() {
  try { return getInternalMailConfig(); }
  catch (error) {
    // Never log provider errors, credentials, message content, or customer details.
    console.error("Internal email configuration is unavailable:", internalMailErrorCode(error));
    return { mode: "off" } as const;
  }
}

export function notificationLink(pathname: string) {
  try {
    const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
    if (base.username || base.password || !["https:", "http:"].includes(base.protocol)) throw new Error("Unsupported URL");
    const link = new URL(pathname, base.origin).toString();
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    return `${link}${local ? "\nLocal testing: this link opens only on the computer running SeqForge." : ""}`;
  } catch {
    // Notification presentation must never roll back a valid customer order.
    return "Open the SeqForge admin portal to review this record.";
  }
}

export async function enqueueInternalNotification(db: NotificationDb, content: NotificationContent) {
  const config = configuredMail();
  if (config.mode === "off") return null;
  const id = randomUUID();
  const status = config.mode === "preview" ? "PREVIEW" : "PENDING";
  const subject = `[SeqForge${config.mode === "preview" ? " PREVIEW" : ""}] ${content.subject.replace(/[\r\n]/g, " ").slice(0, 160)}`;
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "InternalNotification" ("id", "eventKey", "kind", "recipient", "subject", "bodyText", "status", "updatedAt")
    VALUES (${id}, ${content.eventKey}, ${content.kind}, ${config.recipient}, ${subject}, ${content.text}, ${status}, CURRENT_TIMESTAMP)
    ON CONFLICT ("eventKey") DO NOTHING RETURNING "id"`;
  return rows[0]?.id ?? null;
}

export async function enqueueNewCustomer(db: NotificationDb, user: { id: string; name: string; email: string; role?: string; emailVerified?: boolean }) {
  if (user.role === "admin" || configuredMail().mode === "off") return;
  try {
    await enqueueInternalNotification(db, {
      eventKey: `customer:${user.id}`, kind: "NEW_CUSTOMER", subject: "New customer registration",
      text: `A new customer registered.\n\nName: ${user.name}\nEmail: ${user.email}\nEmail verified: ${user.emailVerified ? "Yes" : "No"}\n\nReview customer:\n${notificationLink(`/admin/customers/${encodeURIComponent(user.id)}`)}\n\nInternal staff notification only. No customer email was sent.`,
    });
  } catch {
    // Better Auth invokes this after account creation. A notification failure must
    // never turn a successful registration into a misleading signup error.
    console.error("New customer notification could not be queued; review Customers in the admin portal.");
  }
}

export async function dispatchInternalNotifications(db: NotificationDb, limit = 5, sender: typeof sendInternalMail = sendInternalMail, onlyId?: string) {
  const config = configuredMail();
  if (config.mode !== "smtp") return { accepted: 0, failed: 0 };
  let accepted = 0, failed = 0;
  for (let count = 0; count < Math.min(limit, 20); count++) {
    const token = randomUUID();
    // One atomic claim prevents concurrent HTTP responses from sending the same row.
    // FAILED and expired SENDING messages require an explicit retry, never a silent resend.
    const rows = await db.$queryRaw<InternalNotification[]>`
      UPDATE "InternalNotification" SET "status" = 'SENDING', "attempts" = "attempts" + 1,
        "claimToken" = ${token}, "lockedUntil" = CURRENT_TIMESTAMP + INTERVAL '90 seconds', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (SELECT "id" FROM "InternalNotification" WHERE "status" = 'PENDING'
        AND (${onlyId ?? null}::text IS NULL OR "id" = ${onlyId ?? null})
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
    const item = rows[0];
    if (!item) break;
    try {
      await sender({ id: item.id, recipient: item.recipient, subject: item.subject, text: item.bodyText }, config);
      await db.$executeRaw`UPDATE "InternalNotification" SET "status" = 'SENT', "sentAt" = CURRENT_TIMESTAMP,
        "claimToken" = NULL, "lockedUntil" = NULL, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${item.id} AND "claimToken" = ${token}`;
      accepted++;
    } catch (error) {
      const code = internalMailErrorCode(error);
      await db.$executeRaw`UPDATE "InternalNotification" SET "status" = 'FAILED', "lastError" = ${code},
        "claimToken" = NULL, "lockedUntil" = NULL, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${item.id} AND "claimToken" = ${token}`;
      console.error("Internal notification failed:", item.id, code);
      failed++;
    }
  }
  return { accepted, failed };
}

export async function safeDispatchInternalNotifications(db: PrismaClient) {
  try { await dispatchInternalNotifications(db); }
  catch { console.error("Internal notification queue is unavailable. Orders remain saved; use mail:status to inspect it."); }
}

export async function retryInternalNotification(db: NotificationDb, id: string) {
  const config = getInternalMailConfig();
  if (config.mode !== "smtp") throw new Error("SMTP must be configured before retrying a live notification.");
  const changed = await db.$executeRaw`UPDATE "InternalNotification" SET "status" = 'PENDING',
    "claimToken" = NULL, "lockedUntil" = NULL, "lastError" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id} AND "recipient" = ${config.recipient}
      AND ("status" = 'FAILED' OR ("status" = 'SENDING' AND "lockedUntil" < CURRENT_TIMESTAMP))`;
  if (!changed) throw new Error("No retryable message for the current recipient. Preview and sent messages cannot be replayed.");
}
