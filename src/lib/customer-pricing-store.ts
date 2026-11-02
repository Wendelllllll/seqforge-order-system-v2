import type { Prisma, PrismaClient } from "@prisma/client";
import { composeCustomerRates, customerPriceUpdateSchema, customerPricingRecord, customerPricingSchema, readCustomerPricingRecord, sameCustomerPricing, type CustomerPricing } from "./customer-pricing";
import { getRateSchedule } from "./pricing-store";
import { getOligoPricing, type RateSchedule } from "./rate-schedule";

type Database = PrismaClient | Prisma.TransactionClient;
export class CustomerPriceChanged extends Error {
  constructor(public current: CustomerPricing) { super("Another administrator changed this customer's prices. Reload and review the current prices."); }
}
export class CustomerNotFound extends Error {}
export class InvalidCustomerPriceUpdate extends Error {}
export class CustomerDefaultsChanged extends Error {
  constructor(public current: CustomerPricing, public schedule: RateSchedule) { super("Default prices or available services changed. Load the latest prices and review this customer's agreement before saving."); }
}

// Also used when an order snapshots prices. The advisory lock covers first creation,
// when a CustomerPricing row does not exist and a row lock would protect nothing.
export async function lockCustomerPricing(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"customer-pricing:" + userId}, 0))`;
}

export async function getCustomerPricing(db: Database, userId: string): Promise<CustomerPricing> {
  const row = await db.customerPricing.findUnique({ where: { userId } });
  const record = readCustomerPricingRecord(row?.overrides ?? {});
  return customerPricingSchema.parse({ customerId: userId, revision: row?.revision ?? 0, overrides: record.overrides,
    oligoOverrides: record.oligoOverrides, addOnOverrides: record.addOnOverrides });
}

export async function getEffectiveRateSchedule(db: Database, userId: string) {
  const [schedule, pricing] = await Promise.all([getRateSchedule(db), getCustomerPricing(db, userId)]);
  return composeCustomerRates(schedule, pricing);
}

export async function updateCustomerPricing(db: PrismaClient, actor: { id: string; name: string }, userId: string, input: unknown) {
  const data = customerPriceUpdateSchema.parse(input);
  return db.$transaction(async tx => {
    await lockCustomerPricing(tx, userId);
    const customer = await tx.user.findFirst({ where: { id: userId, role: "customer" }, select: { id: true } });
    if (!customer) throw new CustomerNotFound("Customer not found.");
    const previous = await getCustomerPricing(tx, userId);
    if (data.revision !== previous.revision) throw new CustomerPriceChanged(previous);
    // Match order creation's lock ordering: customer advisory lock, then global
    // shared lock. Global updates wait until availability validation commits.
    await tx.$queryRaw`SELECT id FROM "PricingSchedule" WHERE id = 'active' FOR SHARE`;
    const schedule = await getRateSchedule(tx);
    if (data.globalRevision !== undefined && data.globalRevision !== schedule.revision) throw new CustomerDefaultsChanged(previous, schedule);
    const next = { overrides: data.overrides, oligoOverrides: data.oligoOverrides ?? previous.oligoOverrides ?? {},
      addOnOverrides: data.addOnOverrides ?? previous.addOnOverrides ?? {} };
    const catalog = new Map((schedule.addOns ?? []).map(item => [item.id, item]));
    for (const [id, amount] of Object.entries(next.addOnOverrides)) {
      const item = catalog.get(id);
      if (item?.active && item.unitCents !== null) continue;
      const old = previous.addOnOverrides ?? {};
      if (Object.hasOwn(old, id) && old[id] === amount) continue;
      throw new InvalidCustomerPriceUpdate("Set customer prices only for existing, enabled additional services with a configured default price. An unavailable saved override may be kept unchanged or cleared.");
    }
    if (getOligoPricing(schedule).longUnitCents === null && next.oligoOverrides.longUnitCents !== undefined
      && next.oligoOverrides.longUnitCents !== previous.oligoOverrides?.longUnitCents) {
      throw new InvalidCustomerPriceUpdate("The longer Oligo tier currently requires a quote. Its saved customer override may be kept unchanged or cleared, but cannot set a price for that unavailable tier.");
    }
    if (sameCustomerPricing(previous, next)) return previous;
    const revision = previous.revision + 1;
    const record = customerPricingRecord(next);
    await tx.customerPricing.upsert({ where: { userId }, create: { userId, revision, overrides: record }, update: { revision, overrides: record } });
    await tx.customerPricingChange.create({ data: { customerId: userId, revision, actorId: actor.id, actorName: actor.name, reason: data.reason,
      previousOverrides: customerPricingRecord(previous), overrides: record } });
    return customerPricingSchema.parse({ customerId: userId, revision, ...next });
  }, { maxWait: 10_000, timeout: 20_000 });
}
