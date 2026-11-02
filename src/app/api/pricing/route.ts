import { prisma } from "@/lib/prisma";
import { getRateSchedule } from "@/lib/pricing-store";
export async function GET() {
  return Response.json(await getRateSchedule(prisma), { headers: { "Cache-Control": "no-store" } });
}
