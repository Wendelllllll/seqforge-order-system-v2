import { toNextJsHandler } from "better-auth/next-js";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDispatchInternalNotifications } from "@/lib/internal-notifications";
import { safeVerificationReturn } from "@/lib/verification-return";

const handlers = toNextJsHandler(auth);
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.includes("/reset-password/")) return Response.json({ error: "Use the reset link in your email." }, { status: 404 });
  if (url.pathname.endsWith("/verify-email")) {
    // Email scanners may follow this GET before the customer opens their inbox.
    // Only the explicit confirmation POST may call Better Auth's verification API.
    const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
    let next = "/dashboard";
    try {
      const candidate = new URL(url.searchParams.get("callbackURL") || "/verify-email", base.origin);
      if (candidate.origin === base.origin && candidate.pathname === "/verify-email") next = safeVerificationReturn(candidate.searchParams.get("next"));
    } catch { /* Fall back to the account dashboard. */ }
    const callback = new URL("/verify-email/confirm", base.origin);
    callback.searchParams.set("next", next);
    const token = url.searchParams.get("token");
    if (!token || token.length > 4096) {
      callback.pathname = "/verify-email";
      callback.searchParams.set("error", "INVALID_TOKEN");
    } else {
      callback.searchParams.set("token", token);
    }
    return new Response(null, { status: 303, headers: {
      Location: callback.toString(), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    } });
  }
  return handlers.GET(request);
}
export async function POST(request: Request) {
  // Verification is a signed-in, throttled action using the current account.
  // Do not expose Better Auth's public email-address-based sending endpoint.
  if (new URL(request.url).pathname.endsWith("/send-verification-email")) {
    return Response.json({ error: "Use the verification page to request your email." }, { status: 403 });
  }
  const response = await handlers.POST(request);
  if (response.ok && new URL(request.url).pathname.endsWith("/sign-up/email")) {
    after(() => safeDispatchInternalNotifications(prisma));
  }
  return response;
}
