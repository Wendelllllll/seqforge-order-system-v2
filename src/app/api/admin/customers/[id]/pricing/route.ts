import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerPriceUpdateSchema } from "@/lib/customer-pricing";
import { CustomerNotFound, CustomerPriceChanged, updateCustomerPricing } from "@/lib/customer-pricing-store";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let input: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16_000) return Response.json({ error: "Request too large." }, { status: 413 });
    input = JSON.parse(text);
  } catch { return Response.json({ error: "Send valid JSON." }, { status: 400 }); }
  const parsed = customerPriceUpdateSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Use supported USD rates in whole cents (0–1,000,000), a current revision and a reason. Omit a rate to use the standard price." }, { status: 400 });
  const { id } = await context.params;
  try {
    return Response.json(await updateCustomerPricing(prisma, session.user, id, parsed.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CustomerNotFound) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof CustomerPriceChanged) return Response.json({ error: error.message, pricing: error.current }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    console.error("Customer price update failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save customer prices. Please try again." }, { status: 503 });
  }
}
