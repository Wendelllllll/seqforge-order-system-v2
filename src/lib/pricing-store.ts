import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_ADD_ONS, LEGACY_OLIGO_PRICING, priceUpdateSchema, rateScheduleSchema, type AddOn, type RateSchedule } from "./rate-schedule";
import { pricingRecord, readPricingRecord } from "./pricing-record";

type Database = PrismaClient | Prisma.TransactionClient;
export class PriceChanged extends Error {
  constructor(public schedule: RateSchedule) { super("Prices have changed. Review the updated total and confirm again."); }
}
export class InvalidPriceUpdate extends Error {}

function applyManagedAddOnPrices(previous: AddOn[], requested: AddOn[]): AddOn[] {
  const byId = new Map(requested.map(item => [item.id, item]));
  if (previous.length !== requested.length || previous.some(item => !byId.has(item.id))) {
    throw new InvalidPriceUpdate("Adding or removing additional services requires a development update. You can change prices or enable and disable existing services.");
  }
  return previous.map(item => {
    const update = byId.get(item.id)!;
    if (item.name !== update.name || item.service !== update.service || item.scope !== update.scope || (item.trigger ?? null) !== (update.trigger ?? null)) {
      throw new InvalidPriceUpdate("Additional-service names, service types, charge units and linked treatments require a development update. You can change prices or enable and disable existing services.");
    }
    // Retain definitions and their order, including services provisioned before
    // this restriction. Administrative updates may only edit these two fields.
    return { ...item, unitCents: update.unitCents, active: update.active };
  });
}

export async function getRateSchedule(db: Database): Promise<RateSchedule> {
  const row = await db.pricingSchedule.findUniqueOrThrow({ where: { id: "active" } });
  const record = readPricingRecord(row.rates);
  return rateScheduleSchema.parse({ revision: row.revision, rates: record.rates, oligo: record.oligo ?? LEGACY_OLIGO_PRICING, addOns: record.addOns ?? DEFAULT_ADD_ONS });
}
export async function updateRateSchedule(db: PrismaClient, actor: { id: string; name: string }, input: unknown) {
  const data = priceUpdateSchema.parse(input);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "PricingSchedule" WHERE id = 'active' FOR UPDATE`;
    const previous = await getRateSchedule(tx);
    if (previous.revision !== data.revision) throw new PriceChanged(previous);
    // Older sequencing-only clients must not erase newly managed catalog fields.
    const next = { rates: data.rates, oligo: data.oligo ?? previous.oligo,
      addOns: applyManagedAddOnPrices(previous.addOns ?? [], data.addOns ?? previous.addOns ?? []) };
    const beforeRecord = pricingRecord(previous);
    const nextRecord = pricingRecord(next);
    if (JSON.stringify(beforeRecord) === JSON.stringify(nextRecord)) return previous;
    const revision = previous.revision + 1;
    await tx.pricingSchedule.update({ where: { id: "active" }, data: { revision, rates: nextRecord } });
    await tx.pricingChange.create({ data: { revision, actorId: actor.id, actorName: actor.name, reason: data.reason, previousRates: beforeRecord, rates: nextRecord } });
    return rateScheduleSchema.parse({ revision, ...next });
  });
}
