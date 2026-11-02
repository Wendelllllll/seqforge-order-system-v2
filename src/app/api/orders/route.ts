import { after } from "next/server";
import { auth } from "@/lib/auth";
import { safeDispatchInternalNotifications } from "@/lib/internal-notifications";
import { safeDispatchCustomerNotifications } from "@/lib/customer-notifications";
import { AccountChanged, createOrder, OrderFormOutdated, SubmissionConflict } from "@/lib/create-order";
import { issueLabel, orderSchema } from "@/lib/order-intake";
import { prisma } from "@/lib/prisma";
import { PriceChanged } from "@/lib/pricing-store";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { DropboxChanged } from "@/lib/dropbox-store";
import { InvalidAddOnSelection } from "@/lib/pricing";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role === "admin") return Response.json({ error: "You must be signed in as a customer." }, { status: 401 });
  const submissionKey = request.headers.get("Idempotency-Key") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionKey)) return Response.json({ error: "Reload the order form to start a valid submission." }, { status: 400 });
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 8_000_000) return Response.json({ error: "Order data exceeds the 8 MB submission limit. Reduce the order size or lengthy notes and try again." }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Send a valid JSON order." }, { status: 400 }); }
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the order details.", issues: parsed.error.issues.map(issueLabel) }, { status: 400 });
  const revision = Number(request.headers.get("X-Pricing-Revision"));
  const customerRevision = Number(request.headers.get("X-Customer-Pricing-Revision") || "0");
  const pricingCustomerId = request.headers.get("X-Pricing-Customer-Id") ?? undefined;
  if (pricingCustomerId !== undefined && pricingCustomerId !== session.user.id) return Response.json({ code: "ACCOUNT_CHANGED", error: new AccountChanged().message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  // Read the database so a verification completed in another tab takes effect now.
  const customer = await prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true } });
  if (!customer?.emailVerified) return Response.json({ code: "EMAIL_NOT_VERIFIED", error: "Verify your email before submitting. Your order draft is saved." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  try {
    const order = await createOrder(prisma, session.user.id, parsed.data, submissionKey, revision, customerRevision, pricingCustomerId, request.headers.get("X-Pricing-Catalog-Version"));
    after(() => safeDispatchInternalNotifications(prisma));
    after(() => safeDispatchCustomerNotifications(prisma));
    return Response.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof OrderFormOutdated) return Response.json({ code: "FORM_OUTDATED", error: error.message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof InvalidAddOnSelection) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof DropboxChanged) return Response.json({ code: "DROPBOX_CHANGED", error: error.message }, { status: 409 });
    if (error instanceof AccountChanged) return Response.json({ code: "ACCOUNT_CHANGED", error: error.message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof PriceChanged) return Response.json({ code: "PRICE_CHANGED", error: error.message, schedule: error.schedule }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    if (error instanceof SubmissionConflict) return Response.json({ error: error.message }, { status: 409 });
    console.error("Order creation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save the order. Your entries are still available; please try again." }, { status: 503 });
  }
}
