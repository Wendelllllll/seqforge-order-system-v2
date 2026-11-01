import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { consumePasswordResetLimit, deliverPasswordReset, resetPasswordWithAccountLock } from "../src/lib/password-reset";

test("password recovery in a disposable PostgreSQL schema, without sending mail", async t => {
  const database = new URL(process.env.DATABASE_URL || '');
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(database.hostname));
  const schema = `seqforge_reset_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^seqforge_reset_test_[a-f0-9]{32}$/);
  database.searchParams.set('schema', schema);
  const saved = { ...process.env };
  Object.assign(process.env, { DATABASE_URL: database.toString(), BETTER_AUTH_URL: 'https://reset.example.test', BETTER_AUTH_SECRET: randomUUID() + randomUUID(), CUSTOMER_MAIL_MODE: 'preview', CUSTOMER_MAIL_FROM: 'notifications@example.invalid', INTERNAL_MAIL_MODE: 'off', NODE_ENV: 'test' });
  const db = new PrismaClient({ datasourceUrl: database.toString() });
  let authDb: PrismaClient | undefined;
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: process.env, stdio: 'pipe', windowsHide: true });
    const { auth } = await import('../src/lib/auth');
    authDb = (await import('../src/lib/prisma')).prisma;
    const email = 'recovery@example.invalid';
    const original = 'OriginalPassword!2026';
    const updated = 'ChangedPassword!2026';
    const signup = await auth.api.signUpEmail({ body: { email, password: original, name: 'Reset Test', firstName: 'Reset', lastName: 'Test', organization: 'Isolated tests', labName: 'Test only' } });
    const userId = signup.user.id;
    const getToken = async () => {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: 'https://reset.example.test/reset-password?next=%2Forders%2Fnew%3Fservice%3Dsanger' } });
      const rows = await db.$queryRaw<{ bodyText: string; status: string }[]>`SELECT "bodyText", "status" FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET' AND "userId"=${userId} ORDER BY "createdAt" DESC LIMIT 1`;
      assert.equal(rows[0].status, 'PREVIEW');
      const link = new URL(rows[0].bodyText.match(/https:\/\/[^\s]+/)![0]);
      assert.equal(link.origin, 'https://reset.example.test');
      assert.equal(link.pathname, '/reset-password');
      assert.equal(link.searchParams.get('next'), '/orders/new?service=sanger');
      return link.searchParams.get('token')!;
    };
    await t.test('known and unknown accounts get the same reset API response; preview mail only for known account', async () => {
      const known = await auth.api.requestPasswordReset({ body: { email, redirectTo: '/reset-password' } });
      const unknown = await auth.api.requestPasswordReset({ body: { email: 'absent@example.invalid', redirectTo: '/reset-password' } });
      assert.deepEqual(known, unknown);
      const count = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET'`;
      assert.equal(Number(count[0].count), 1);
    });
    await t.test('expired links and invalid passwords do not change the password', async () => {
      const token = await getToken();
      await assert.rejects(auth.api.resetPassword({ body: { token, newPassword: 'short' } }));
      assert.ok(await db.verification.findFirst({ where: { identifier: `reset-password:${token}` } }));
      await db.verification.updateMany({ where: { identifier: `reset-password:${token}` }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await assert.rejects(auth.api.resetPassword({ body: { token, newPassword: updated } }));
      assert.ok(await auth.api.signInEmail({ body: { email, password: original } }));
    });
    await t.test('reset is one-use, invalidates previous sessions and other reset links, and never verifies email', async () => {
      const oldToken = await getToken();
      const token = await getToken();
      assert.ok(await db.session.count({ where: { userId } }));
      await auth.api.resetPassword({ body: { token, newPassword: updated } });
      assert.equal(await db.session.count({ where: { userId } }), 0);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified, false);
      await assert.rejects(auth.api.resetPassword({ body: { token, newPassword: original } }));
      await assert.rejects(auth.api.resetPassword({ body: { token: oldToken, newPassword: original } }));
      await assert.rejects(auth.api.signInEmail({ body: { email, password: original } }));
      assert.ok(await auth.api.signInEmail({ body: { email, password: updated } }));
    });
    await t.test('rate limits are atomic, account-independent, and recover after cooldown', async () => {
      const instant = new Date();
      const results = await Promise.all(Array.from({ length: 3 }, () => consumePasswordResetLimit(db, 'request', 'not-an-account@example.invalid', instant)));
      assert.equal(results.filter(value => value === 0).length, 1);
      assert.equal(results.filter(value => value === 60).length, 2);
      assert.equal(await consumePasswordResetLimit(db, 'request', 'not-an-account@example.invalid', new Date(instant.getTime() + 61_000)), 0);
      const markers = await db.verification.findMany({ where: { identifier: { startsWith: 'password-reset-limit:' } } });
      assert.ok(markers.every(marker => !marker.identifier.includes('@') && !marker.value.includes('@')));
    });
    await t.test('two different active tokens cannot reset one account concurrently', async () => {
      const tokens = [await getToken(), await getToken()];
      assert.notEqual(tokens[0], tokens[1]);
      const passwords = ['ConcurrentResetOne!2026', 'ConcurrentResetTwo!2026'];
      const results = await Promise.allSettled(tokens.map((token, i) => resetPasswordWithAccountLock(db, token, () => auth.api.resetPassword({ body: { token, newPassword: passwords[i] } }))));
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter(result => result.status === 'rejected').length, 1);
      const winner = results.findIndex(result => result.status === 'fulfilled');
      assert.ok(await auth.api.signInEmail({ body: { email, password: passwords[winner] } }));
      await assert.rejects(auth.api.signInEmail({ body: { email, password: passwords[1 - winner] } }));
      assert.equal(await db.verification.count({ where: { value: userId, identifier: { startsWith: 'reset-password:' } } }), 0);
    });
    await t.test('unrelated email requests and invalid tokens cannot exhaust another account recovery budget', async () => {
      const now = new Date();
      for (let i = 0; i < 105; i++) assert.equal(await consumePasswordResetLimit(db, 'request', `absent-${i}@example.invalid`, now), 0);
      assert.equal(await consumePasswordResetLimit(db, 'request', email, now), 0);
      const before = await db.verification.count({ where: { identifier: { startsWith: 'password-reset-limit:confirm:' } } });
      for (let i = 0; i < 205; i++) assert.equal(await consumePasswordResetLimit(db, 'confirm', `InvalidToken${String(i).padStart(24, '0')}`, now), 0);
      assert.equal(await db.verification.count({ where: { identifier: { startsWith: 'password-reset-limit:confirm:' } } }), before);
      const token = await getToken();
      assert.equal(await consumePasswordResetLimit(db, 'confirm', token), 0);
      await resetPasswordWithAccountLock(db, token, () => auth.api.resetPassword({ body: { token, newPassword: updated } }));
    });
    await t.test('mail allowlist suppresses nonapproved recipients and never calls transport', async () => {
      Object.assign(process.env, { NODE_ENV: 'development', CUSTOMER_MAIL_MODE: 'smtp', CUSTOMER_MAIL_ALLOWED_RECIPIENTS: 'approved@example.invalid', SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '465', SMTP_USER: 'fake-user', SMTP_PASSWORD: 'fake-test-only-password' });
      let sends = 0;
      await deliverPasswordReset(db, { id: userId, email }, 'A'.repeat(24), 'https://reset.example.test/api/auth/reset-password/test?callbackURL=%2Freset-password', async () => { sends++; return undefined as never; });
      assert.equal(sends, 0);
      const rows = await db.$queryRaw<{ status: string }[]>`SELECT "status" FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET' ORDER BY "createdAt" DESC LIMIT 1`;
      assert.equal(rows[0].status, 'SUPPRESSED');
    });
    await t.test('approved reset mail records accepted or failed delivery using a fake transport', async () => {
      process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS = '*';
      let sends = 0;
      await deliverPasswordReset(db, { id: userId, email }, 'B'.repeat(24), 'https://reset.example.test/api/auth/reset-password/test?callbackURL=%2Freset-password', async message => {
        sends++;
        assert.equal(message.recipient, email);
        assert.match(message.text, /reset-password\?token=/);
        return undefined as never;
      });
      assert.equal(sends, 1);
      let rows = await db.$queryRaw<{ status: string }[]>`SELECT "status" FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET' ORDER BY "createdAt" DESC LIMIT 1`;
      assert.equal(rows[0].status, 'SENT');
      const log = t.mock.method(console, 'error', () => undefined);
      await deliverPasswordReset(db, { id: userId, email }, 'C'.repeat(24), 'https://reset.example.test/api/auth/reset-password/test?callbackURL=%2Freset-password', async () => { throw new Error('Fake SMTP failure'); });
      rows = await db.$queryRaw<{ status: string }[]>`SELECT "status" FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET' ORDER BY "createdAt" DESC LIMIT 1`;
      assert.equal(rows[0].status, 'FAILED');
      assert.equal(log.mock.callCount(), 1);
      log.mock.restore();
    });
  } finally {
    await authDb?.$disconnect();
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
