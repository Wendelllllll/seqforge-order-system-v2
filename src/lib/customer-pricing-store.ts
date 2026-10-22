import type { Prisma, PrismaClient } from "@prisma/client";
import { composeCustomerRates, customerPriceUpdateSchema, customerPricingSchema, sameCustomerOverrides, type CustomerPricing } from "./customer-pricing";
import { getRateSchedule } from "./pricing-store";

type Database = PrismaClient | Prisma.TransactionClient;
export class CustomerPriceChanged extends Error {
  constructor(public current: CustomerPricing) { super("Another administrator changed this customer's prices. Reload and review the current prices."); }
}
export class CustomerNotFound extends Error {}

// Also used when an order snapshots prices. The advisory lock covers first creation,
// when a CustomerPricing row does not exist and a row lock would protect nothing.
export async function lockCustomerPricing(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"customer-pricing:" + userId}, 0))`;
}

export async function getCustomerPricing(db: Database, userId: string): Promise<CustomerPricing> {
  const row = await db.customerPricing.findUnique({ where: { userId } });
  return customerPricingSchema.parse({ customerId: userId, revision: row?.revision ?? 0, overrides: row?.overrides ?? {} });
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
    if (sameCustomerOverrides(previous.overrides, data.overrides)) return previous;
    const revision = previous.revision + 1;
    await tx.customerPricing.upsert({ where: { userId }, create: { userId, revision, overrides: data.overrides }, update: { revision, overrides: data.overrides } });
    await tx.customerPricingChange.create({ data: { customerId: userId, revision, actorId: actor.id, actorName: actor.name, reason: data.reason, previousOverrides: previous.overrides, overrides: data.overrides } });
    return { customerId: userId, revision, overrides: data.overrides };
  }, { maxWait: 10_000, timeout: 20_000 });
}
