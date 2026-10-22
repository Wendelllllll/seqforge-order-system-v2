import { getInternalMailConfig, internalMailErrorCode, sendInternalMail, type InternalMailMessage, type InternalMailTransportFactory, type SmtpInternalMailConfig } from "./internal-mail";

export class CustomerMailError extends Error {
  constructor(readonly code: string) { super(code); this.name = "CustomerMailError"; }
}

export type CustomerMailConfig =
  | { mode: "off" }
  | { mode: "preview"; from: string }
  | { mode: "smtp"; from: string; allowedRecipients: string[]; allowAll: boolean; smtp: Omit<SmtpInternalMailConfig, "recipient"> };

function address(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(normalized) || normalized.length > 254) throw new CustomerMailError("MAIL_CONFIG_INVALID");
  return normalized;
}

export function getCustomerMailConfig(env: Partial<NodeJS.ProcessEnv> = process.env): CustomerMailConfig {
  const mode = env.CUSTOMER_MAIL_MODE || "off";
  if (mode === "off") return { mode };
  if (mode !== "preview" && mode !== "smtp") throw new CustomerMailError("MAIL_CONFIG_INVALID");
  const from = address(env.CUSTOMER_MAIL_FROM || env.INTERNAL_MAIL_FROM || "");
  if (mode === "preview") return { mode, from };
  const policy = (env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS || "").trim();
  const allowAll = policy === "*" && env.NODE_ENV === "production";
  if (!policy || (policy.includes("*") && !allowAll)) throw new CustomerMailError("MAIL_CONFIG_INVALID");
  const allowedRecipients = allowAll ? [] : [...new Set(policy.split(",").map(address))];
  const config = getInternalMailConfig({ ...env, INTERNAL_MAIL_MODE: "smtp", INTERNAL_MAIL_TO: from, INTERNAL_MAIL_FROM: from });
  if (config.mode !== "smtp") throw new CustomerMailError("MAIL_CONFIG_INVALID");
  const { recipient: _recipient, ...smtp } = config;
  void _recipient;
  return { mode, from, allowedRecipients, allowAll, smtp };
}

export function customerRecipientAllowed(config: CustomerMailConfig, recipient: string) {
  const normalized = address(recipient);
  return config.mode === "preview" || (config.mode === "smtp" && (config.allowAll || config.allowedRecipients.includes(normalized)));
}

export function customerMailErrorCode(error: unknown) {
  return error instanceof CustomerMailError ? error.code : internalMailErrorCode(error);
}

export async function sendCustomerMail(message: InternalMailMessage, config: Extract<CustomerMailConfig, { mode: "smtp" }>, factory?: InternalMailTransportFactory) {
  if (!customerRecipientAllowed(config, message.recipient)) throw new CustomerMailError("RECIPIENT_NOT_ALLOWED");
  // Reuse TLS, explicit-envelope and test guards without changing internal recipients.
  return sendInternalMail(message, { ...config.smtp, recipient: address(message.recipient) }, factory);
}
