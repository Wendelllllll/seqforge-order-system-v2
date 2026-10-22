import assert from "node:assert/strict";
import { test } from "node:test";
import type { SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  getInternalMailConfig,
  internalMailErrorCode,
  sendInternalMail,
  type InternalMailMessage,
  type InternalMailTransportFactory,
  type SmtpInternalMailConfig,
} from "../src/lib/internal-mail";

const smtpEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  INTERNAL_MAIL_MODE: "smtp",
  INTERNAL_MAIL_TO: "receiver@example.com",
  INTERNAL_MAIL_FROM: "sender@gmail.com",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "465",
  SMTP_USER: "sender@gmail.com",
  SMTP_PASSWORD: "aaaa bbbb cccc dddd",
};
function config(patch: Partial<NodeJS.ProcessEnv> = {}): SmtpInternalMailConfig {
  const parsed = getInternalMailConfig({ ...smtpEnv, ...patch });
  assert.equal(parsed.mode, "smtp");
  return parsed as SmtpInternalMailConfig;
}
const message: InternalMailMessage = { id: "notification-123", recipient: "receiver@example.com", subject: "SeqForge new order", text: "A new order is available in the admin queue." };

test("mail is off unless explicitly enabled; preview needs no SMTP credential", () => {
  assert.deepEqual(getInternalMailConfig({}), { mode: "off" });
  assert.deepEqual(getInternalMailConfig({ ...smtpEnv, INTERNAL_MAIL_MODE: "preview", SMTP_PASSWORD: "" }), { mode: "preview", recipient: "receiver@example.com", from: "sender@gmail.com" });
  assert.throws(() => getInternalMailConfig({ ...smtpEnv, INTERNAL_MAIL_MODE: "enabled" }), /MAIL_CONFIG_INVALID/);
});

test("configuration accepts exactly one bare recipient and forbids header/list injection", () => {
  for (const address of ["", "a@example.com,b@example.com", "a@example.com; b@example.com", "Name <a@example.com>", "a@example.com\r\nBcc: other@example.com", "a@example.com b@example.com", "a@localhost"]) {
    assert.throws(() => getInternalMailConfig({ ...smtpEnv, INTERNAL_MAIL_TO: address }), /MAIL_CONFIG_INVALID/, address);
  }
  assert.equal(config({ INTERNAL_MAIL_TO: "Receiver@Example.COM" }).recipient, "receiver@example.com");
  assert.equal(config({ INTERNAL_MAIL_TO: "pickup@seqforge.com" }).recipient, "pickup@seqforge.com");
});

test("Gmail requires matching sender, app password, and encrypted SMTP", () => {
  assert.equal(config().password, "aaaabbbbccccdddd");
  assert.equal(config().secure, true);
  assert.equal(config({ SMTP_PORT: "587" }).secure, false);
  for (const patch of [{ SMTP_PORT: "25" }, { SMTP_PORT: "465x" }, { SMTP_PASSWORD: "" }, { SMTP_PASSWORD: "ordinary-password" }, { INTERNAL_MAIL_FROM: "pretend@seqforge.com" }, { SMTP_HOST: "smtp://user:secret@example.com" }]) {
    assert.throws(() => config(patch), /MAIL_CONFIG_INVALID/);
  }
});

test("test and isolated smoke environments cannot enable SMTP", () => {
  assert.throws(() => config({ NODE_ENV: "test" }), /SMTP_DISABLED_IN_TESTS/);
  assert.throws(() => config({ SEQFORGE_SMOKE_SCHEMA: "seqforge_smoke_fake" }), /SMTP_DISABLED_IN_TESTS/);
  assert.equal(getInternalMailConfig({ ...smtpEnv, NODE_ENV: "test", INTERNAL_MAIL_MODE: "preview" }).mode, "preview");
});

test("company SMTP can replace Gmail without the Gmail app-password format", () => {
  const company = config({
    INTERNAL_MAIL_TO: "pickup@seqforge.com",
    INTERNAL_MAIL_FROM: "admin@seqforge.com",
    SMTP_HOST: "mail.seqforge.com",
    SMTP_PORT: "587",
    SMTP_USER: "admin@seqforge.com",
    SMTP_PASSWORD: "synthetic-company-password",
  });
  assert.equal(company.recipient, "pickup@seqforge.com");
  assert.equal(company.from, "admin@seqforge.com");
  assert.equal(company.host, "mail.seqforge.com");
  assert.equal(company.port, 587);
  assert.equal(company.secure, false);
  assert.equal(company.password, "synthetic-company-password");
});

test("send uses only configured internal recipient, TLS, no CC/BCC, and stable message ID", async () => {
  const sent: SendMailOptions[] = [];
  const options: SMTPTransport.Options[] = [];
  let closed = 0;
  const fake: InternalMailTransportFactory = settings => {
    options.push(settings);
    return { sendMail: async data => { sent.push(data); return { accepted: ["receiver@example.com"], rejected: [] }; }, close: () => { closed++; } };
  };
  const first = await sendInternalMail({ ...message, subject: "Order\r\nSubject" }, config(), fake);
  const second = await sendInternalMail(message, config({ SMTP_PORT: "587" }), fake);
  assert.equal(first.status, "accepted");
  assert.equal(first.messageId, second.messageId);
  assert.equal(sent[0].subject, "Order Subject");
  for (const mail of sent) {
    assert.equal(mail.to, "receiver@example.com");
    assert.deepEqual(mail.envelope, { from: "sender@gmail.com", to: ["receiver@example.com"] });
    for (const key of ["cc", "bcc", "replyTo", "attachments", "html"]) assert.equal(key in mail, false, key);
    assert.equal(mail.disableFileAccess, true);
    assert.equal(mail.disableUrlAccess, true);
  }
  assert.equal(options[0].secure, true);
  assert.equal(options[1].secure, false);
  for (const option of options) {
    assert.equal(option.requireTLS, true);
    assert.equal(option.tls?.minVersion, "TLSv1.2");
    assert.equal(option.tls?.rejectUnauthorized, true);
    assert.equal(option.debug, false);
    assert.equal(option.logger, false);
  }
  assert.equal(closed, 2);
});

test("preview mode and recipient changes cannot open a transport", async () => {
  let calls = 0;
  const neverSend: InternalMailTransportFactory = () => { calls++; throw new Error("No network permitted"); };
  await assert.rejects(sendInternalMail(message, { ...config(), mode: "preview" } as unknown as SmtpInternalMailConfig, neverSend), /MAIL_DISABLED/);
  await assert.rejects(sendInternalMail(message, config({ INTERNAL_MAIL_TO: "pickup@seqforge.com" }), neverSend), /RECIPIENT_CHANGED/);
  assert.equal(calls, 0);
});

test("SMTP rejects and errors are sanitized; acceptance does not imply delivery", async () => {
  const rejected: InternalMailTransportFactory = () => ({ sendMail: async () => ({ accepted: [], rejected: ["receiver@example.com"] }), close: () => {} });
  await assert.rejects(sendInternalMail(message, config(), rejected), /RECIPIENT_REJECTED/);
  const wrongRecipient: InternalMailTransportFactory = () => ({ sendMail: async () => ({ accepted: ["different@example.com"] }), close: () => {} });
  await assert.rejects(sendInternalMail(message, config(), wrongRecipient), /RECIPIENT_REJECTED/);
  const failed: InternalMailTransportFactory = () => ({ sendMail: async () => { throw Object.assign(new Error("secret password and customer data"), { code: "EAUTH" }); }, close: () => {} });
  await assert.rejects(sendInternalMail(message, config(), failed), error => error instanceof Error && error.message === "AUTH_FAILED");
  assert.equal(internalMailErrorCode({ code: "EAUTH", message: "secret" }), "AUTH_FAILED");
  assert.equal(internalMailErrorCode({ code: "ETIMEDOUT", message: "secret" }), "CONNECTION_FAILED");
  assert.equal(internalMailErrorCode({ code: "EENVELOPE", message: "secret" }), "RECIPIENT_REJECTED");
  assert.equal(internalMailErrorCode(new Error("secret")), "SEND_FAILED");
});
