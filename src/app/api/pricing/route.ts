import { prisma } from "@/lib/prisma";
import { getRateSchedule } from "@/lib/pricing-store";
import { OLIGO_BASE_RATE_CENTS, OLIGO_STANDARD_MAX_BASES } from "@/lib/oligo-schema";
export async function GET() {
  return Response.json({
    ...await getRateSchedule(prisma),
    oligo: { unitCents: OLIGO_BASE_RATE_CENTS, maxStandardLength: OLIGO_STANDARD_MAX_BASES },
  }, { headers: { "Cache-Control": "no-store" } });
}
