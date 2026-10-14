import type { Prisma, PrismaClient } from "@prisma/client";
import { priceUpdateSchema, rateScheduleSchema, type RateSchedule } from "./rate-schedule";

type Database = PrismaClient | Prisma.TransactionClient;
export class PriceChanged extends Error {
  constructor(public schedule: RateSchedule) { super("Prices have changed. Review the updated total and confirm again."); }
}
export async function getRateSchedule(db: Database): Promise<RateSchedule> {
  return rateScheduleSchema.parse(await db.pricingSchedule.findUniqueOrThrow({ where: { id: "active" } }));
}
export async function updateRateSchedule(db: PrismaClient, actor: { id: string; name: string }, input: unknown) {
  const data = priceUpdateSchema.parse(input);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PricingSchedule" WHERE id = 'active' FOR UPDATE`;
    const previous = await getRateSchedule(tx);
    if (previous.revision !== data.revision) throw new PriceChanged(previous);
    if (Object.keys(previous.rates).every(key => previous.rates[key as keyof typeof previous.rates] === data.rates[key as keyof typeof data.rates])) return previous;
    const revision = previous.revision + 1;
    await tx.pricingSchedule.update({ where: { id: "active" }, data: { revision, rates: data.rates } });
    await tx.pricingChange.create({ data: { revision, actorId: actor.id, actorName: actor.name, reason: data.reason, previousRates: previous.rates, rates: data.rates } });
    return { revision, rates: data.rates };
  });
}
