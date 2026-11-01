import { after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { consumePasswordResetLimit, resetRequestSchema } from "@/lib/password-reset";
import { getCustomerMailConfig } from "@/lib/customer-mail";
import { safeAuthReturn } from "@/lib/order-resume";

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  const parsed = resetRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Enter a valid email address.' }, { status: 400, headers });
  try {
    if (getCustomerMailConfig().mode === 'off') throw new Error('MAIL_DISABLED');
    const retryAfter = await consumePasswordResetLimit(prisma, 'request', parsed.data.email);
    if (retryAfter) return Response.json({ error: 'Please wait before requesting another link.', retryAfter }, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } });
    const redirectTo = new URL('/reset-password', process.env.BETTER_AUTH_URL || 'http://localhost:3000');
    const next = safeAuthReturn(parsed.data.next);
    if (next) redirectTo.searchParams.set('next', next);
    // All valid addresses get the same response before account lookup or SMTP.
    after(async () => {
      try { await auth.api.requestPasswordReset({ body: { email: parsed.data.email, redirectTo: redirectTo.toString() } }); }
      catch { console.error('Password reset request could not be processed. No account information is returned.'); }
    });
    return Response.json({ ok: true, message: 'If this email has a SeqForge account, a reset link will be sent. Check your inbox and junk folder.' }, { headers });
  } catch {
    return Response.json({ error: 'Password recovery is temporarily unavailable. Please try again later or contact our team.' }, { status: 503, headers });
  }
}
