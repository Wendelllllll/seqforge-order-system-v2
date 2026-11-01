import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { customerMailErrorCode, customerRecipientAllowed, getCustomerMailConfig, sendCustomerMail } from "./customer-mail";
import { safeAuthReturn } from "./order-resume";

export const RESET_TOKEN_SECONDS = 60 * 60;
export const resetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), next: z.string().max(2000).optional() }).strict();
export const resetPasswordSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,256}$/), newPassword: z.string().min(8).max(128) }).strict();
export class PasswordResetBusy extends Error {}

/** Keep different active tokens for one account from racing password updates. */
export async function resetPasswordWithAccountLock(db: PrismaClient, token: string, reset: () => Promise<unknown>) {
  const identifier = `reset-password:${token}`;
  const verification = await db.verification.findFirst({ where: { identifier, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!verification) throw new Error('INVALID_RESET_TOKEN');
  return db.$transaction(async tx => {
    const lock = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`password-reset-account:${verification.value}`}, 0)) AS acquired`;
    if (!lock[0].acquired) throw new PasswordResetBusy('A password reset is already being processed. Please try again shortly.');
    // Another request may have consumed this or a sibling token before the lock.
    const current = await tx.verification.findFirst({ where: { id: verification.id, identifier, value: verification.value, expiresAt: { gt: new Date() } } });
    if (!current) throw new Error('INVALID_RESET_TOKEN');
    // Better Auth performs password hashing, one-use consumption, sibling cleanup
    // and session revocation while this account lock remains held.
    return reset();
  }, { maxWait: 5_000, timeout: 30_000 });
}

export function passwordResetLink(token: string, callback: string, baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000") {
  if (!resetPasswordSchema.shape.token.safeParse(token).success) throw new Error("INVALID_RESET_TOKEN");
  const base = new URL(baseURL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error("INVALID_RESET_ORIGIN");
  const result = new URL('/reset-password', base.origin);
  const supplied = new URL(callback, base.origin);
  const next = supplied.origin === base.origin && supplied.pathname === '/reset-password' ? safeAuthReturn(supplied.searchParams.get('next')) : null;
  result.searchParams.set('token', token);
  if (next) result.searchParams.set('next', next);
  return result.toString();
}

/** Request limits never reveal account existence. Random reset tokens create no rows. */
export async function consumePasswordResetLimit(db: PrismaClient, action: 'request' | 'confirm', subject: string, now = new Date()) {
  if (action === 'confirm') {
    const verification = await db.verification.findFirst({ where: { identifier: `reset-password:${subject}`, expiresAt: { gt: now } }, select: { value: true } });
    if (!verification) return 0;
    subject = verification.value;
  }
  const windowMs = action === 'request' ? 60 * 60 * 1000 : 15 * 60 * 1000;
  const keys = [
    { key: `password-reset-limit:${action}:${createHash('sha256').update(subject).digest('hex')}`, max: action === 'request' ? 5 : 10, cooldown: action === 'request' ? 60_000 : 0 },
  ];
  return db.$transaction(async tx => {
    const updates = [];
    for (const item of keys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${item.key}, 0))`;
      const old = await tx.verification.findUnique({ where: { id: item.key } });
      const active = old && old.expiresAt > now;
      const value: { count: number; last: number } = active ? JSON.parse(old.value) : { count: 0, last: 0 };
      const retryMs = Math.max(value.count >= item.max ? old!.expiresAt.getTime() - now.getTime() : 0, value.last + item.cooldown - now.getTime());
      if (retryMs > 0) return Math.max(1, Math.ceil(retryMs / 1000));
      updates.push({ item, expiresAt: active ? old.expiresAt : new Date(now.getTime() + windowMs), value: JSON.stringify({ count: value.count + 1, last: now.getTime() }) });
    }
    for (const update of updates) await tx.verification.upsert({ where: { id: update.item.key }, create: { id: update.item.key, identifier: update.item.key, value: update.value, expiresAt: update.expiresAt }, update: { value: update.value, expiresAt: update.expiresAt } });
    await tx.verification.deleteMany({ where: { identifier: { startsWith: 'password-reset-limit:' }, expiresAt: { lt: now } } });
    return 0;
  });
}

/** Called only by Better Auth after it creates a one-hour reset token. */
export async function deliverPasswordReset(db: PrismaClient, user: { id: string; email: string }, token: string, generatedURL: string, sender = sendCustomerMail) {
  const config = getCustomerMailConfig();
  if (config.mode === 'off') return;
  const generated = new URL(generatedURL);
  const link = passwordResetLink(token, generated.searchParams.get('callbackURL') || '/reset-password');
  const allowed = customerRecipientAllowed(config, user.email);
  const id = randomUUID();
  const subject = '[SeqForge] Reset your password';
  const bodyText = `We received a request to reset your SeqForge password.\n\nChoose a new password:\n${link}\n\nThis link expires in one hour and can be used once. Opening it does not change your password. After you set a new password, existing sign-in sessions will end.\n\nYour orders and saved drafts are preserved. If you did not request this change, you can ignore this email. Your current password will stay unchanged.`;
  const status = config.mode === 'preview' ? 'PREVIEW' : allowed ? 'SENDING' : 'SUPPRESSED';
  const attempts = config.mode === 'smtp' && allowed ? 1 : 0;
  await db.$executeRaw`INSERT INTO "CustomerNotification" ("id", "eventKey", "userId", "kind", "recipient", "subject", "bodyText", "status", "attempts", "expiresAt", "updatedAt") VALUES (${id}, ${`password-reset:${id}`}, ${user.id}, 'PASSWORD_RESET', ${user.email}, ${subject}, ${bodyText}, ${status}, ${attempts}, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP)`;
  if (config.mode !== 'smtp' || !allowed) return;
  try {
    await sender({ id, recipient: user.email, subject, text: bodyText }, config);
    await db.$executeRaw`UPDATE "CustomerNotification" SET "status" = 'SENT', "sentAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}`;
  } catch (error) {
    await db.$executeRaw`UPDATE "CustomerNotification" SET "status" = 'FAILED', "lastError" = ${customerMailErrorCode(error)}, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}`;
    // Never log reset links, credentials, mail bodies or raw SMTP errors.
    console.error('Password reset email delivery failed. Review its notification status.');
  }
}
