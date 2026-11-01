import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/** Called by smoke-ordering only, after its existing fixture-count assertions. */
export async function runPasswordResetSmoke() {
  const origin = process.env.SEQFORGE_SMOKE_ORIGIN || "";
  const schema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
  assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/);
  assert.equal(new URL(process.env.DATABASE_URL || "postgresql://invalid").searchParams.get("schema"), schema);
  assert.match(origin, /^http:\/\/localhost:\d+$/);
  assert.notEqual(new URL(origin).port, "3000", "Reset smoke must never target the working app");
  assert.equal(process.env.INTERNAL_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS, "");
  assert.equal(process.env.SMTP_PASSWORD, "");
  const db = new PrismaClient();
  async function request(path: string, body?: unknown, cookie = "", requestOrigin: string | null = origin, method = body === undefined ? "GET" : "POST") {
    return fetch(origin + path, { method, redirect: "manual", headers: { ...(requestOrigin === null ? {} : { origin: requestOrigin }), ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const cookies = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  try {
    const current = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
    assert.equal(current[0].schema, schema, 'Confirm isolation before creating reset fixtures');
    const beforeOrders = await db.order.count();
    const email = `reset-${randomUUID()}@example.test`;
    const otherEmail = `reset-other-${randomUUID()}@example.test`;
    const original = 'OriginalReset!2026';
    const updated = 'UpdatedReset!2026';
    async function register(address: string) {
      const response = await request('/api/auth/sign-up/email', { email: address, password: original, name: 'Recovery Test', firstName: 'Recovery', lastName: 'Test', organization: 'Isolated smoke', labName: 'Disposable schema' });
      assert.equal(response.status, 200);
      const cookie = cookies(response);
      assert.ok(cookie);
      return cookie;
    }
    const ownerCookie = await register(email);
    const otherCookie = await register(otherEmail);
    const owner = await db.user.findUniqueOrThrow({ where: { email } });
    const other = await db.user.findUniqueOrThrow({ where: { email: otherEmail } });
    assert.equal(owner.emailVerified, false);
    assert.equal(other.emailVerified, false);
    const beforeOtherSessions = await db.session.count({ where: { userId: other.id } });
    const beforeOwnerPassword = (await db.account.findFirstOrThrow({ where: { userId: owner.id, providerId: 'credential' } })).password;
    for (const badOrigin of [null, 'null', 'https://untrusted.example']) {
      assert.equal((await request('/api/account/password-reset/request', { email }, '', badOrigin)).status, 403);
      assert.equal((await request('/api/account/password-reset', { token: 'A'.repeat(24), newPassword: updated }, '', badOrigin)).status, 403);
    }
    for (const [path, body] of [
      ['/api/auth/request-password-reset', { email, redirectTo: '/reset-password' }],
      ['/api/auth/reset-password', { token: 'A'.repeat(24), newPassword: updated }],
    ] as const) assert.equal((await request(path, body)).status, 404, 'Raw auth paths cannot bypass reset throttling');
    assert.equal((await request('/api/auth/reset-password/' + 'A'.repeat(24) + '?callbackURL=https://untrusted.example')).status, 404);
    const next = '/orders/new?service=sanger&type=standard';
    const known = await request('/api/account/password-reset/request', { email, next });
    const unknown = await request('/api/account/password-reset/request', { email: `absent-${randomUUID()}@example.test`, next });
    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json(), 'Recovery never exposes account existence');
    assert.match(known.headers.get('cache-control') || '', /private.*no-store/);
    const cooldown = await request('/api/account/password-reset/request', { email, next });
    assert.equal(cooldown.status, 429);
    assert.ok(Number(cooldown.headers.get('retry-after')) > 0);
    type Preview = { bodyText: string; recipient: string; status: string; attempts: number };
    let messages: Preview[] = [];
    const deadline = Date.now() + 10_000;
    do {
      messages = await db.$queryRaw<Preview[]>`SELECT "bodyText", "recipient", "status", "attempts" FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET' AND "userId"=${owner.id}`;
      if (messages.length) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
    assert.equal(messages.length, 1, 'The asynchronous reset request creates one preview email');
    assert.equal(messages[0].status, 'PREVIEW');
    assert.equal(messages[0].recipient, email);
    assert.equal(messages[0].attempts, 0);
    const allReset = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM "CustomerNotification" WHERE "kind"='PASSWORD_RESET'`;
    assert.equal(allReset[0].count, 1, 'Unknown accounts must not create mail');
    const link = [...messages[0].bodyText.matchAll(/https?:\/\/[^\s<>]+/g)].map(match => new URL(match[0])).find(url => url.origin === origin && url.pathname === '/reset-password');
    assert.ok(link);
    assert.equal(link.searchParams.get('next'), next);
    const token = link.searchParams.get('token');
    assert.ok(token);
    for (const cookie of ['', ownerCookie, otherCookie]) {
      const page = await request(link.pathname + link.search, undefined, cookie);
      assert.equal(page.status, 200);
      assert.equal(page.headers.getSetCookie().length, 0, 'Reset page never signs into the token owner');
      assert.match(await page.text(), /Choose a new password/);
    }
    const head = await request(link.pathname + link.search, undefined, '', origin, 'HEAD');
    assert.equal(head.status, 200);
    assert.ok(await db.verification.findFirst({ where: { identifier: `reset-password:${token}` } }), 'Email-scanner GET/HEAD must not consume reset tokens');
    assert.equal((await db.account.findFirstOrThrow({ where: { userId: owner.id, providerId: 'credential' } })).password, beforeOwnerPassword);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, false);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).emailVerified, false);
    assert.equal((await request('/api/account/password-reset', { token, newPassword: 'short' })).status, 400);
    assert.ok(await db.verification.findFirst({ where: { identifier: `reset-password:${token}` } }));
    const reset = await request('/api/account/password-reset', { token, newPassword: updated }, otherCookie);
    assert.equal(reset.status, 200);
    assert.deepEqual(await reset.json(), { ok: true });
    assert.equal(reset.headers.getSetCookie().length, 0);
    assert.equal(await db.session.count({ where: { userId: owner.id } }), 0);
    assert.equal(await db.session.count({ where: { userId: other.id } }), beforeOtherSessions);
    assert.equal((await request('/api/account/email-verification', undefined, ownerCookie)).status, 401);
    assert.equal((await request('/api/account/email-verification', undefined, otherCookie)).status, 200);
    assert.equal((await request('/api/account/password-reset', { token, newPassword: original })).status, 400);
    assert.equal((await request('/api/auth/sign-in/email', { email, password: original })).status, 401);
    assert.equal((await request('/api/auth/sign-in/email', { email, password: updated })).status, 200);
    assert.equal((await request('/api/auth/sign-in/email', { email: otherEmail, password: original })).status, 200);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).emailVerified, false);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: other.id } })).emailVerified, false);
    assert.equal(await db.order.count(), beforeOrders, 'Password recovery never creates orders');
    console.log('Password reset HTTP smoke passed: passive GET, preview-only mail, isolated accounts, throttling, one-use reset and session revocation.');
  } finally { await db.$disconnect(); }
}
