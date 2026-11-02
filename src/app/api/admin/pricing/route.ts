import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InvalidPriceUpdate, PriceChanged, updateRateSchedule } from "@/lib/pricing-store";
import { priceUpdateSchema } from "@/lib/rate-schedule";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let input: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 64000) return Response.json({ error: "Request too large." }, { status: 413 });
    input = JSON.parse(text);
  } catch { return Response.json({ error: "Send valid JSON." }, { status: 400 }); }
  const parsed = priceUpdateSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message || "Check the prices, additional services and reason for change." }, { status: 400 });
  try {
    return Response.json(await updateRateSchedule(prisma, session.user, parsed.data));
  } catch (error) {
    if (error instanceof PriceChanged) return Response.json({ error: "Another administrator changed the prices. Reload and review their changes first.", schedule: error.schedule }, { status: 409 });
    if (error instanceof InvalidPriceUpdate) return Response.json({ error: error.message }, { status: 400 });
    console.error("Price update failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save prices. Please try again." }, { status: 503 });
  }
}
