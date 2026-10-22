import assert from "node:assert/strict";
import { test } from "node:test";
import type { SendMailOptions } from "nodemailer";
import { customerMailErrorCode, customerRecipientAllowed, getCustomerMailConfig, sendCustomerMail, type CustomerMailConfig } from "../src/lib/customer-mail";
import type { InternalMailTransportFactory } from "../src/lib/internal-mail";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "development", CUSTOMER_MAIL_MODE: "smtp",
  CUSTOMER_MAIL_ALLOWED_RECIPIENTS: "customer@example.test, Second@Example.Test",
  INTERNAL_MAIL_FROM: "sender@gmail.com", INTERNAL_MAIL_TO: "staff@example.test",
  SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "sender@gmail.com", SMTP_PASSWORD: "aaaa bbbb cccc dddd",
};
function smtp(patch: Partial<NodeJS.ProcessEnv> = {}) {
  const config = getCustomerMailConfig({ ...env, ...patch });
  assert.equal(config.mode, "smtp");
  return config as Extract<CustomerMailConfig, { mode: "smtp" }>;
}
const message = { id: "customer-event", recipient: "customer@example.test", subject: "Verify your email", text: "A synthetic verification message." };

test("customer mail is independently off by default and preview requires no sending credential", () => {
  assert.deepEqual(getCustomerMailConfig({ INTERNAL_MAIL_MODE: "smtp" }), { mode: "off" });
  const preview = getCustomerMailConfig({ ...env, CUSTOMER_MAIL_MODE: "preview", SMTP_PASSWORD: "", CUSTOMER_MAIL_ALLOWED_RECIPIENTS: "" });
  assert.deepEqual(preview, { mode: "preview", from: "sender@gmail.com" });
  assert.ok(customerRecipientAllowed(preview, "synthetic@example.test"));
});

test("live customer delivery requires an explicit allowlist and wildcard is production-only", () => {
  for (const policy of ["", "*", "customer@example.test,*", "Name <customer@example.test>", "customer@example.test\r\nBcc: other@example.test"]) {
    assert.throws(() => smtp({ CUSTOMER_MAIL_ALLOWED_RECIPIENTS: policy }), /MAIL_CONFIG_INVALID/);
  }
  const config = smtp();
  assert.ok(customerRecipientAllowed(config, "CUSTOMER@example.test"));
  assert.ok(customerRecipientAllowed(config, "second@example.test"));
  assert.equal(customerRecipientAllowed(config, "staff@example.test"), false);
  assert.equal(customerRecipientAllowed(config, "unrelated@example.test"), false);
  assert.ok(customerRecipientAllowed(smtp({ NODE_ENV: "production", CUSTOMER_MAIL_ALLOWED_RECIPIENTS: "*" }), "production-customer@example.test"));
});

test("customer delivery preserves the actual customer recipient with no CC or BCC", async () => {
  const captured: SendMailOptions[] = [];
  const fake: InternalMailTransportFactory = () => ({
    sendMail: async options => { captured.push(options); return { accepted: [message.recipient], rejected: [] }; },
    close() {},
  });
  const result = await sendCustomerMail(message, smtp(), fake);
  assert.equal(result.status, "accepted");
  assert.equal(captured.length, 1);
  assert.equal(captured[0].to, message.recipient);
  assert.deepEqual(captured[0].envelope, { from: "sender@gmail.com", to: [message.recipient] });
  assert.equal(captured[0].cc, undefined);
  assert.equal(captured[0].bcc, undefined);
  assert.equal(captured[0].attachments, undefined);
  assert.equal(captured[0].disableFileAccess, true);
  assert.equal(captured[0].disableUrlAccess, true);
});

test("disallowed recipients and header injection never open a transport", async () => {
  let connections = 0;
  const neverSend: InternalMailTransportFactory = () => { connections++; throw new Error("No network allowed"); };
  for (const recipient of ["staff@example.test", "another@example.test", "customer@example.test,other@example.test", "customer@example.test\r\nBcc: other@example.test"]) {
    await assert.rejects(sendCustomerMail({ ...message, recipient }, smtp(), neverSend));
  }
  assert.equal(connections, 0);
});

test("customer mail retains the isolated-test SMTP guard at configuration and send time", async () => {
  assert.throws(() => smtp({ NODE_ENV: "test" }), /SMTP_DISABLED_IN_TESTS/);
  assert.throws(() => smtp({ SEQFORGE_SMOKE_SCHEMA: "seqforge_smoke_synthetic" }), /SMTP_DISABLED_IN_TESTS/);
  const config = smtp();
  const previous = process.env.SEQFORGE_SMOKE_SCHEMA;
  let connections = 0;
  try {
    process.env.SEQFORGE_SMOKE_SCHEMA = "seqforge_smoke_synthetic";
    await assert.rejects(sendCustomerMail(message, config, () => { connections++; throw new Error("No network allowed"); }), /SMTP_DISABLED_IN_TESTS/);
    assert.equal(connections, 0);
  } finally {
    if (previous === undefined) delete process.env.SEQFORGE_SMOKE_SCHEMA;
    else process.env.SEQFORGE_SMOKE_SCHEMA = previous;
  }
});

test("provider failure diagnostics contain codes only", async () => {
  const fake: InternalMailTransportFactory = () => ({
    sendMail: async () => { throw Object.assign(new Error("private token, password, and customer content"), { code: "EAUTH" }); },
    close() {},
  });
  await assert.rejects(sendCustomerMail(message, smtp(), fake), error => customerMailErrorCode(error) === "AUTH_FAILED" && error instanceof Error && !error.message.includes("private"));
});
