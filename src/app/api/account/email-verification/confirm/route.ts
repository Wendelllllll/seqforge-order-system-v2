import { auth } from "@/lib/auth";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { safeVerificationReturn } from "@/lib/verification-return";

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  if (!hasTrustedRequestOrigin(request)) {
    return Response.json({ error: "Untrusted request origin." }, { status: 403, headers: privateHeaders });
  }
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return Response.json({ error: "Submit the email confirmation form." }, { status: 400, headers: privateHeaders });
  }
  const body = await request.text();
  if (body.length > 16384) return new Response(null, { status: 413, headers: privateHeaders });
  const form = new URLSearchParams(body);
  const callback = new URL("/verify-email", process.env.BETTER_AUTH_URL || "http://localhost:3000");
  callback.searchParams.set("next", safeVerificationReturn(form.get("next")));
  const token = form.get("token");
  if (!token || token.length > 4096) {
    callback.searchParams.set("error", "INVALID_TOKEN");
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: callback.toString() } });
  }
  callback.searchParams.set("verified", "1");

  // Better Auth validates the signature and expiry; do not decode a token as proof.
  // This server API bypasses HTTP middleware, so the Origin check above is required.
  const response = await auth.api.verifyEmail({
    headers: request.headers,
    query: { token, callbackURL: callback.toString() },
    asResponse: true,
  });
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  // Native form navigation removes the token from the destination, including errors.
  return new Response(null, { status: response.status >= 300 && response.status < 400 ? 303 : response.status, headers });
}
