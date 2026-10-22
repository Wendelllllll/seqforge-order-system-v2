import { toNextJsHandler } from "better-auth/next-js";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeDispatchInternalNotifications } from "@/lib/internal-notifications";
import { safeVerificationReturn } from "@/lib/verification-return";

const handlers = toNextJsHandler(auth);
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/verify-email")) {
    // Both successful and failed links return to our designed verification page.
    // Never use the request Host or an arbitrary callback as an email destination.
    const base = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000");
    let next = "/dashboard";
    try {
      const candidate = new URL(url.searchParams.get("callbackURL") || "/verify-email", base.origin);
      if (candidate.origin === base.origin && candidate.pathname === "/verify-email") next = safeVerificationReturn(candidate.searchParams.get("next"));
    } catch { /* Fall back to the account dashboard. */ }
    const callback = new URL("/verify-email", base.origin);
    callback.searchParams.set("next", next);
    callback.searchParams.set("verified", "1");
    if (!url.searchParams.get("token")) {
      callback.searchParams.set("error", "INVALID_TOKEN");
      return Response.redirect(callback, 303);
    }
    url.searchParams.set("callbackURL", callback.toString());
    return handlers.GET(new Request(url, request));
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
