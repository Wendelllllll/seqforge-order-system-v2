import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { consumePasswordResetLimit, PasswordResetBusy, resetPasswordSchema, resetPasswordWithAccountLock } from "@/lib/password-reset";

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Use a valid reset link and a password between 8 and 128 characters.' }, { status: 400, headers });
  let retryAfter: number;
  try { retryAfter = await consumePasswordResetLimit(prisma, 'confirm', parsed.data.token); }
  catch { return Response.json({ error: 'Password recovery is temporarily unavailable. Please try again shortly.' }, { status: 503, headers }); }
  if (retryAfter) return Response.json({ error: 'Too many attempts. Please wait before trying again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(retryAfter) } });
  try {
    await resetPasswordWithAccountLock(prisma, parsed.data.token, () => auth.api.resetPassword({ body: parsed.data }));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof PasswordResetBusy) return Response.json({ error: error.message }, { status: 429, headers: { ...headers, 'Retry-After': '2' } });
    return Response.json({ error: 'This reset link has expired, has already been used, or is invalid. Request a new link.' }, { status: 400, headers });
  }
}
