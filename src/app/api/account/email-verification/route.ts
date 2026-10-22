import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerMailError, getCustomerMailConfig } from "@/lib/customer-mail";
import { dispatchCustomerNotifications, VerificationCooldown } from "@/lib/customer-notifications";
import { safeVerificationReturn } from "@/lib/verification-return";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in to verify your email." }, { status: 401, headers: noStore });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true } });
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  return Response.json({ email: user.email, verified: user.emailVerified }, { headers: noStore });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Please sign in to verify your email." }, { status: 401, headers: noStore });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, emailVerified: true } });
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401, headers: noStore });
  if (user.emailVerified) return Response.json({ ok: true, verified: true, email: user.email }, { headers: noStore });
  let body: { next?: unknown };
  try {
    const text = await request.text();
    if (text.length > 2000) throw new Error("Body too large");
    body = JSON.parse(text);
    if (!body || typeof body !== "object") throw new Error("Invalid body");
  } catch { return Response.json({ error: "Please reload the verification page." }, { status: 400, headers: noStore }); }
  try {
    const config = getCustomerMailConfig();
    if (config.mode === "off") throw new CustomerMailError("MAIL_DISABLED");
    const next = safeVerificationReturn(body.next);
    const callbackURL = `/verify-email?next=${encodeURIComponent(next)}&verified=1`;
    await auth.api.sendVerificationEmail({ headers: request.headers, body: { email: user.email, callbackURL } });
    const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CustomerNotification"
      WHERE "userId" = ${user.id} AND "kind" = 'VERIFY_EMAIL' ORDER BY "createdAt" DESC LIMIT 1`;
    if (!rows[0]) throw new CustomerMailError("SEND_FAILED");
    if (config.mode === "smtp") {
      const result = await dispatchCustomerNotifications(prisma, 1, undefined, rows[0].id);
      if (result.accepted !== 1) throw new CustomerMailError("SEND_FAILED");
    }
    return Response.json({ ok: true, email: user.email, delivery: config.mode === "preview" ? "preview" : "sent" }, { headers: noStore });
  } catch (error) {
    if (error instanceof VerificationCooldown) return Response.json({ error: "Please wait a moment before requesting another email.", code: "VERIFICATION_COOLDOWN", retryAfter: error.retryAfter }, { status: 429, headers: { ...noStore, "Retry-After": String(error.retryAfter) } });
    if (error instanceof CustomerMailError && error.code === "RECIPIENT_NOT_ALLOWED") return Response.json({ error: "This test site can send email only to approved test accounts. Sign in with your test email to continue.", code: "RECIPIENT_NOT_ALLOWED" }, { status: 403, headers: noStore });
    return Response.json({ error: "We couldn't send your verification email. Please try again shortly or contact our team.", code: "EMAIL_UNAVAILABLE" }, { status: 503, headers: noStore });
  }
}
