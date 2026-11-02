import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { CONTACT_RECIPIENT, contactMessage, contactSchema, createContactHandler, createContactState, getContactMailConfig } from "../src/lib/contact";
import { sendInternalMail, type SmtpInternalMailConfig } from "../src/lib/internal-mail";

const config: SmtpInternalMailConfig = { mode: "smtp", recipient: CONTACT_RECIPIENT, from: "sender@example.com", host: "smtp.example.com", port: 465, secure: true, user: "sender@example.com", password: "synthetic-test-only" };
const input = { name: "Lab visitor", email: "visitor@example.com", organization: "Example lab", service: "sanger", message: "Can you help with sample preparation?", website: "" };
function request(body: unknown = input, id: string = randomUUID(), headers: Record<string, string> = {}) {
  return new Request("https://site.example/api/contact", { method: "POST", headers: { origin: "https://site.example", "Content-Type": "application/json", "Idempotency-Key": id, ...headers }, body: JSON.stringify(body) });
}
function setup(options: Partial<Parameters<typeof createContactHandler>[0]> = {}) {
  let sends = 0;
  let now = Date.now();
  const handle = createContactHandler({ state: createContactState(), config: () => config, send: async message => { sends++; assert.equal(message.recipient, CONTACT_RECIPIENT); assert.equal(message.replyTo, input.email); }, baseURL: "https://site.example", now: () => now, logError: () => {}, ...options });
  return { handle, sends: () => sends, advance: (ms: number) => { now += ms; } };
}

test("contact uses a fixed recipient and independent explicit enable switch", () => {
  assert.deepEqual(getContactMailConfig({ INTERNAL_MAIL_MODE: "smtp" }), { mode: "off" });
  assert.throws(() => getContactMailConfig({ CONTACT_MAIL_MODE: "preview" }));
  const env = { CONTACT_MAIL_MODE: "smtp", INTERNAL_MAIL_FROM: config.from, INTERNAL_MAIL_TO: "ops@example.com", SMTP_HOST: config.host, SMTP_PORT: "465", SMTP_USER: config.user, SMTP_PASSWORD: config.password };
  const parsed = getContactMailConfig(env);
  assert.equal(parsed.mode, "smtp");
  if (parsed.mode === "smtp") assert.equal(parsed.recipient, CONTACT_RECIPIENT);
  assert.throws(() => getContactMailConfig({ ...env, SEQFORGE_SMOKE_SCHEMA: "disposable_test" }), /SMTP_DISABLED_IN_TESTS/);
  assert.throws(() => getContactMailConfig({ ...env, NODE_ENV: "test" }), /SMTP_DISABLED_IN_TESTS/);
});

test("invalid input, foreign origins, honeypot, bad keys and oversized body never send", async () => {
  const app = setup();
  const cases: [Request, number][] = [
    [request(input, randomUUID(), { origin: "https://other.example" }), 403],
    [request(input, randomUUID(), { "Content-Type": "text/plain" }), 415],
    [request(input, "invalid"), 400],
    [request({ ...input, email: "valid@example.com\r\nBcc: other@example.com" }), 400],
    [request({ ...input, name: "Name\nInjected" }), 400],
    [request({ ...input, recipient: "other@example.com" }), 400],
    [request({ ...input, website: "spam.example" }), 400],
    [request({ ...input, message: "short" }), 400],
    [request({ ...input, service: "made-up" }), 400],
    [request({ ...input, message: "x".repeat(33_000) }), 413],
    [request(input, randomUUID(), { "Content-Length": "33000" }), 413],
  ];
  for (const [req, status] of cases) assert.equal((await app.handle(req)).status, status);
  assert.equal(app.sends(), 0);
});

test("contact succeeds only after transport acceptance and simultaneous retries send once", async () => {
  let release!: () => void;
  let calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const app = setup({ send: async () => { calls++; await gate; } });
  const id = randomUUID();
  const first = app.handle(request(input, id));
  const second = app.handle(request(input, id));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await (await first).json(), { success: true });
  assert.deepEqual(await (await second).json(), { success: true });
  assert.equal((await app.handle(request(input, id))).status, 200);
  assert.equal(calls, 1);
  assert.equal((await app.handle(request({ ...input, message: "A different question about preparation." }, id))).status, 409);
});

test("mail disabled, failed SMTP and rejected recipients never return false success", async () => {
  assert.equal((await setup({ config: () => ({ mode: "off" }) }).handle(request())).status, 503);
  let calls = 0;
  const app = setup({ send: async () => { calls++; throw new Error("private provider details"); } });
  const id = randomUUID();
  const failed = await app.handle(request(input, id));
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("private provider"), false);
  assert.equal((await app.handle(request(input, id))).status, 429);
  app.advance(61_000);
  assert.equal((await app.handle(request(input, id))).status, 503);
  assert.equal(calls, 2);
  await assert.rejects(sendInternalMail(contactMessage(contactSchema.parse(input), id), config, () => ({ sendMail: async () => ({ accepted: [], rejected: [CONTACT_RECIPIENT] }), close() {} })), /RECIPIENT_REJECTED/);
});

test("per-email cooldown/hourly limit cannot be bypassed by new idempotency keys", async () => {
  const app = setup();
  for (let i = 0; i < 5; i++) {
    assert.equal((await app.handle(request())).status, 200);
    const limited = await app.handle(request());
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    app.advance(61_000);
  }
  assert.equal((await app.handle(request())).status, 429);
  assert.equal(app.sends(), 5);
  app.advance(3_600_000);
  assert.equal((await app.handle(request())).status, 200);
});

test("global cap bounds mail across arbitrary email addresses", async () => {
  let calls = 0;
  const app = setup({ send: async () => { calls++; } });
  for (let i = 0; i < 60; i++) assert.equal((await app.handle(request({ ...input, email: `visitor${i}@example.com` }))).status, 200);
  assert.equal((await app.handle(request({ ...input, email: "different@example.com" }))).status, 429);
  assert.equal(calls, 60);
});

test("SMTP mail has validated Reply-To, fixed envelope, and plain text without CC/BCC", async () => {
  const message = contactMessage(contactSchema.parse({ ...input, message: "<script>alert('hello')</script>" }), randomUUID());
  await sendInternalMail(message, config, () => ({
    sendMail: async options => {
      assert.equal(options.replyTo, input.email);
      assert.equal(options.from, config.from);
      assert.equal(options.to, CONTACT_RECIPIENT);
      assert.deepEqual(options.envelope, { from: config.from, to: [CONTACT_RECIPIENT] });
      assert.equal(options.cc, undefined); assert.equal(options.bcc, undefined); assert.equal(options.html, undefined);
      assert.ok(String(options.text).includes(input.organization));
      assert.ok(String(options.text).includes("<script>"));
      return { accepted: [CONTACT_RECIPIENT], rejected: [] };
    }, close() {},
  }));
  for (const replyTo of ["Name <valid@example.com>", "a@example.com,b@example.com", "a@example.com\r\nBcc: b@example.com"]) {
    await assert.rejects(sendInternalMail({ ...message, replyTo }, config, () => { throw new Error("must not open transport"); }), /MAIL_CONFIG_INVALID/);
  }
});
