import { createHash } from "node:crypto";
import nodemailer, { type SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type InternalMailMode = "off" | "preview" | "smtp";
export type SmtpInternalMailConfig = {
  mode: "smtp";
  recipient: string;
  from: string;
  host: string;
  port: 465 | 587;
  secure: boolean;
  user: string;
  password: string;
};
export type InternalMailConfig =
  | { mode: "off" }
  | { mode: "preview"; recipient: string; from: string }
  | SmtpInternalMailConfig;

export type InternalMailMessage = {
  id: string;
  recipient: string;
  subject: string;
  text: string;
};

type MailErrorCode =
  | "MAIL_CONFIG_INVALID"
  | "MAIL_DISABLED"
  | "SMTP_DISABLED_IN_TESTS"
  | "RECIPIENT_CHANGED"
  | "AUTH_FAILED"
  | "CONNECTION_FAILED"
  | "RECIPIENT_REJECTED"
  | "SEND_FAILED";

class InternalMailError extends Error {
  constructor(readonly code: MailErrorCode) {
    super(code);
    this.name = "InternalMailError";
  }
}

function singleAddress(value: string | undefined): string {
  const address = (value || "").trim();
  // One bare mailbox only. Configuration must never expand into a recipient list.
  if (address.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(address)) {
    throw new InternalMailError("MAIL_CONFIG_INVALID");
  }
  return address.toLowerCase();
}

function smtpForbidden(env: Partial<NodeJS.ProcessEnv>): boolean {
  return env.NODE_ENV === "test" || Boolean(env.SEQFORGE_SMOKE_SCHEMA);
}

export function getInternalMailConfig(env: Partial<NodeJS.ProcessEnv> = process.env): InternalMailConfig {
  const mode = env.INTERNAL_MAIL_MODE || "off";
  if (mode === "off") return { mode };
  if (mode !== "preview" && mode !== "smtp") throw new InternalMailError("MAIL_CONFIG_INVALID");
  const recipient = singleAddress(env.INTERNAL_MAIL_TO);
  const from = singleAddress(env.INTERNAL_MAIL_FROM);
  if (mode === "preview") return { mode, recipient, from };
  if (smtpForbidden(env)) throw new InternalMailError("SMTP_DISABLED_IN_TESTS");

  const host = (env.SMTP_HOST || "").trim().toLowerCase();
  const rawPort = env.SMTP_PORT || "465";
  const user = (env.SMTP_USER || "").trim();
  let password = env.SMTP_PASSWORD || "";
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host) || !["465", "587"].includes(rawPort) || !user || /[\r\n]/.test(user)) {
    throw new InternalMailError("MAIL_CONFIG_INVALID");
  }
  if (host === "smtp.gmail.com") {
    if (singleAddress(user) !== from) throw new InternalMailError("MAIL_CONFIG_INVALID");
    password = password.replace(/\s/g, "");
    if (!/^[a-zA-Z0-9]{16}$/.test(password)) throw new InternalMailError("MAIL_CONFIG_INVALID");
  }
  if (!password || /[\r\n]/.test(password)) throw new InternalMailError("MAIL_CONFIG_INVALID");
  const port = Number(rawPort) as 465 | 587;
  return { mode, recipient, from, host, port, secure: port === 465, user, password };
}

export function internalMailErrorCode(error: unknown): MailErrorCode {
  if (error instanceof InternalMailError) return error.code;
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "EAUTH") return "AUTH_FAILED";
  if (["ECONNECTION", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EDNS", "ENOTFOUND", "ESOCKET", "ETLS"].includes(String(code))) return "CONNECTION_FAILED";
  if (code === "EENVELOPE") return "RECIPIENT_REJECTED";
  return "SEND_FAILED";
}

type InternalMailTransport = {
  sendMail(options: SendMailOptions): Promise<{ accepted?: unknown[]; rejected?: unknown[]; messageId?: string }>;
  close(): void;
};
export type InternalMailTransportFactory = (options: SMTPTransport.Options) => InternalMailTransport;

export async function sendInternalMail(
  message: InternalMailMessage,
  config: SmtpInternalMailConfig,
  createTransport: InternalMailTransportFactory = options => nodemailer.createTransport(options),
): Promise<{ status: "accepted"; messageId: string }> {
  // Keep this guard at the actual send boundary as well as at configuration parsing.
  if (config.mode !== "smtp") throw new InternalMailError("MAIL_DISABLED");
  if (smtpForbidden(process.env)) throw new InternalMailError("SMTP_DISABLED_IN_TESTS");
  if (singleAddress(message.recipient) !== singleAddress(config.recipient)) throw new InternalMailError("RECIPIENT_CHANGED");
  const recipient = singleAddress(config.recipient);
  const from = singleAddress(config.from);
  if (!message.id || !message.subject.trim() || !message.text) throw new InternalMailError("MAIL_CONFIG_INVALID");
  const messageId = `<seqforge-${createHash("sha256").update(message.id).digest("hex")}@${from.split("@")[1]}>`;
  let transport: InternalMailTransport | undefined;
  try {
    transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      requireTLS: true,
      auth: { user: config.user, pass: config.password },
      tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      logger: false,
      debug: false,
    });
    const result = await transport.sendMail({
      from,
      to: recipient,
      envelope: { from, to: [recipient] },
      messageId,
      subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 180),
      text: message.text,
      disableFileAccess: true,
      disableUrlAccess: true,
      headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
    });
    if (result.accepted?.length !== 1 || typeof result.accepted[0] !== "string" || result.accepted[0].toLowerCase() !== recipient || (result.rejected?.length || 0) > 0) {
      throw new InternalMailError("RECIPIENT_REJECTED");
    }
    // SMTP acceptance is not proof of inbox delivery.
    return { status: "accepted", messageId };
  } catch (error) {
    // Provider errors can include addresses, credentials, and message content.
    throw new InternalMailError(internalMailErrorCode(error));
  } finally {
    try { transport?.close(); } catch { /* Never leak provider cleanup errors. */ }
  }
}
