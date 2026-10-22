import { auth } from "@/lib/auth";
import { getEffectiveRateSchedule } from "@/lib/customer-pricing-store";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== "customer") return Response.json({ error: "Sign in as a customer." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(await getEffectiveRateSchedule(prisma, session.user.id), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
}
