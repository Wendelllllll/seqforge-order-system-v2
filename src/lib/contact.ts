import { createHash } from "node:crypto";
import { z } from "zod";
import { getInternalMailConfig, internalMailErrorCode, sendInternalMail, type InternalMailMessage, type SmtpInternalMailConfig } from "./internal-mail";
import { hasTrustedRequestOrigin } from "./request-origin";

export const CONTACT_RECIPIENT = "info@seqforge.com";
const HOUR = 60 * 60 * 1000;
const BODY_LIMIT = 32 * 1024;
const SERVICES = { general: "General question", molecular: "Molecular services / Oligo", sanger: "Sanger sequencing", nanopore: "Nanopore / Whole plasmid sequencing" };
const line = (max: number) => z.string().trim().max(max).refine(value => [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127));
export const contactSchema = z.object({
  name: line(120).pipe(z.string().min(1)),
  email: line(254).pipe(z.string().email()).transform(value => value.toLowerCase()),
  organization: line(200).optional().default(""),
  service: z.enum(["", "general", "molecular", "sanger", "nanopore"]).optional().default("general").transform(value => value || "general"),
  message: z.string().trim().min(10).max(5000).refine(value => [...value].every(char => [9, 10, 13].includes(char.charCodeAt(0)) || (char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127))),
  website: z.string().max(500).optional().default(""),
}).strict();

export function getContactMailConfig(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const mode = env.CONTACT_MAIL_MODE || "off";
  if (mode === "off") return { mode } as const;
  if (mode !== "smtp") throw new Error("MAIL_CONFIG_INVALID");
  return getInternalMailConfig({ ...env, INTERNAL_MAIL_MODE: mode, INTERNAL_MAIL_TO: CONTACT_RECIPIENT, INTERNAL_MAIL_FROM: env.CONTACT_MAIL_FROM || env.INTERNAL_MAIL_FROM || env.CUSTOMER_MAIL_FROM });
}

export function contactMessage(data: z.infer<typeof contactSchema>, id: string): InternalMailMessage {
  return {
    id: `contact:${id}`,
    recipient: CONTACT_RECIPIENT,
    replyTo: data.email,
    subject: `[SeqForge inquiry] ${SERVICES[data.service]}`,
    text: `New website inquiry\n\nName: ${data.name}\nEmail: ${data.email}\nOrganization: ${data.organization || "Not provided"}\nService: ${SERVICES[data.service]}\n\nMessage:\n${data.message}\n\n---\nReply to this email to contact the sender. These details were provided through the public contact form; the email address has not been verified.\nReference: ${id}`,
  };
}

type Attempt = { fingerprint: string; expires: number; result: Promise<boolean> };
type Counter = { count: number; last: number; expires: number };
export function createContactState() {
  return { attempts: new Map<string, Attempt>(), limits: new Map<string, Counter>() };
}
type ContactDependencies = {
  state: ReturnType<typeof createContactState>;
  config?: typeof getContactMailConfig;
  send?: (message: InternalMailMessage, config: SmtpInternalMailConfig) => Promise<unknown>;
  now?: () => number;
  baseURL?: string;
  logError?: (code: string) => void;
};
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function reply(status: number, body: Record<string, unknown>, retryAfter?: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
}
function unavailable() { return reply(503, { error: "We couldn't send your message. Please try again or email info@seqforge.com directly." }); }

async function readBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > BODY_LIMIT) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

/** Bounded single-process safeguards. No customer message bodies are persisted here. */
export function createContactHandler(deps: ContactDependencies) {
  return async function handle(request: Request) {
    if (!hasTrustedRequestOrigin(request, deps.baseURL)) return reply(403, { error: "Please reload this page before sending your message." });
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply(415, { error: "Please use the contact form to send your message." });
    const id = request.headers.get("idempotency-key") || "";
    if (!z.string().uuid().safeParse(id).success) return reply(400, { error: "Please reload this page before sending your message." });
    let body: unknown;
    try { body = await readBody(request); }
    catch (error) { return reply(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, { error: "Please check your message and keep it under 5,000 characters." }); }
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) return reply(400, { error: "Please enter your name, a valid email, and a message between 10 and 5,000 characters." });
    if (parsed.data.website) return reply(400, { error: "We couldn't process this form. Please email info@seqforge.com directly." });
    const now = (deps.now || Date.now)();
    const { attempts, limits } = deps.state;
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
    const fingerprint = hash(JSON.stringify(parsed.data));
    const key = hash(id);
    const previous = attempts.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) return reply(409, { error: "Your message changed. Please submit it again with a new request." });
      return (await previous.result) ? reply(200, { success: true }) : unavailable();
    }
    let config;
    try { config = (deps.config || getContactMailConfig)(); }
    catch { return unavailable(); }
    if (config.mode !== "smtp") return unavailable();

    // Do not trust caller-supplied IP/proxy headers. Apply per-email and global caps.
    const buckets = [{ key: `email:${hash(parsed.data.email)}`, max: 5, cooldown: 60_000 }, { key: "global", max: 60, cooldown: 0 }];
    let retryMs = 0;
    for (const bucket of buckets) {
      const counter = limits.get(bucket.key);
      if (counter) retryMs = Math.max(retryMs, counter.count >= bucket.max ? counter.expires - now : 0, counter.last + bucket.cooldown - now);
    }
    if (retryMs > 0 || attempts.size >= 2000 || limits.size >= 2000) {
      const retryAfter = Math.max(1, Math.ceil(retryMs / 1000), attempts.size >= 2000 || limits.size >= 2000 ? 3600 : 0);
      return reply(429, { error: "Please wait before sending another message, or email info@seqforge.com directly." }, retryAfter);
    }
    for (const bucket of buckets) {
      const counter = limits.get(bucket.key);
      limits.set(bucket.key, { count: (counter?.count || 0) + 1, last: now, expires: counter?.expires || now + HOUR });
    }
    // Install the promise before invoking the transport so simultaneous retries join it.
    const result = Promise.resolve().then(async () => {
      try {
        await (deps.send || sendInternalMail)(contactMessage(parsed.data, id), config);
        return true;
      } catch (error) {
        (deps.logError || (code => console.error(`Contact email failed (${code}).`)))(internalMailErrorCode(error));
        attempts.delete(key);
        return false;
      }
    });
    attempts.set(key, { fingerprint, expires: now + 24 * HOUR, result });
    return (await result) ? reply(200, { success: true }) : unavailable();
  };
}
