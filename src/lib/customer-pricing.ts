import { z } from "zod";
import { ACTIVE_RATE_ITEMS, getOligoPricing, type RateKey, type RateSchedule } from "./rate-schedule";

const keys = ACTIVE_RATE_ITEMS.map(item => item.key) as [RateKey, ...RateKey[]];
const unitCents = z.number().int().min(0).max(1_000_000);
export const customerOverridesSchema = z.partialRecord(z.enum(keys), unitCents);
export const customerOligoOverridesSchema = z.object({ shortUnitCents: unitCents.optional(), longUnitCents: unitCents.optional() }).strict();
export const customerAddOnOverridesSchema = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), unitCents)
  .refine(value => Object.keys(value).length <= 100, "Keep at most 100 additional-service overrides, including retired services.");
export const customerPricingSchema = z.object({
  customerId: z.string().min(1).max(128),
  revision: z.number().int().nonnegative(),
  overrides: customerOverridesSchema,
  oligoOverrides: customerOligoOverridesSchema.optional(),
  addOnOverrides: customerAddOnOverridesSchema.optional(),
});
export type CustomerPricing = z.infer<typeof customerPricingSchema>;
export const customerPriceUpdateSchema = z.object({
  revision: z.number().int().nonnegative(),
  overrides: customerOverridesSchema,
  // Omitted maps preserve existing agreements for older sequencing-only editors;
  // an explicitly supplied empty map resets that group to the default prices.
  oligoOverrides: customerOligoOverridesSchema.optional(),
  addOnOverrides: customerAddOnOverridesSchema.optional(),
  globalRevision: z.number().int().positive().optional(),
  reason: z.string().trim().min(1, "Give a reason for this price change.").max(500),
}).strict();

const customerPricingRecordSchema = z.object({
  format: z.literal(2), overrides: customerOverridesSchema,
  oligoOverrides: customerOligoOverridesSchema, addOnOverrides: customerAddOnOverridesSchema,
}).strict();
export type CustomerPricingRecord = Omit<z.infer<typeof customerPricingRecordSchema>, "format"> & { format: 1 | 2 };

/** Existing customer rows and audit history used the flat eight-rate map. */
export function readCustomerPricingRecord(value: unknown): CustomerPricingRecord {
  if (value && typeof value === "object" && "format" in value) return customerPricingRecordSchema.parse(value);
  return { format: 1 as const, overrides: customerOverridesSchema.parse(value), oligoOverrides: {}, addOnOverrides: {} };
}

export function customerPricingRecord(pricing: Pick<CustomerPricing, "overrides" | "oligoOverrides" | "addOnOverrides">) {
  return customerPricingRecordSchema.parse({ format: 2, overrides: pricing.overrides, oligoOverrides: pricing.oligoOverrides ?? {}, addOnOverrides: pricing.addOnOverrides ?? {} });
}

export function composeCustomerRates(schedule: RateSchedule, pricing: CustomerPricing): RateSchedule {
  const oligo = getOligoPricing(schedule);
  const overrides = pricing.oligoOverrides ?? {};
  const addOnOverrides = pricing.addOnOverrides ?? {};
  const overriddenOligoKeys: ("shortUnitCents" | "longUnitCents")[] = [];
  if (overrides.shortUnitCents !== undefined) overriddenOligoKeys.push("shortUnitCents");
  if (oligo.longUnitCents !== null && overrides.longUnitCents !== undefined) overriddenOligoKeys.push("longUnitCents");
  const overriddenAddOnIds: string[] = [];
  const addOns = schedule.addOns?.map(item => {
    const override = Object.hasOwn(addOnOverrides, item.id) ? addOnOverrides[item.id] : undefined;
    // Saved stale overrides cannot resurrect a deleted, disabled or unpriced service.
    if (!item.active || item.unitCents === null || override === undefined) return item;
    overriddenAddOnIds.push(item.id);
    return { ...item, unitCents: override };
  });
  return {
    ...schedule,
    rates: { ...schedule.rates, ...pricing.overrides },
    oligo: { ...oligo, shortUnitCents: overrides.shortUnitCents ?? oligo.shortUnitCents,
      longUnitCents: oligo.longUnitCents === null ? null : overrides.longUnitCents ?? oligo.longUnitCents },
    ...(addOns ? { addOns } : {}),
    customerId: pricing.customerId,
    customerRevision: pricing.revision,
    overriddenKeys: ACTIVE_RATE_ITEMS.filter(item => pricing.overrides[item.key] !== undefined).map(item => item.key),
    overriddenOligoKeys, overriddenAddOnIds,
  };
}

export function sameCustomerPricing(a: Pick<CustomerPricing, "overrides" | "oligoOverrides" | "addOnOverrides">, b: Pick<CustomerPricing, "overrides" | "oligoOverrides" | "addOnOverrides">) {
  const sameMap = (left: Record<string, number | undefined>, right: Record<string, number | undefined>) => {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && left[key] === right[key]);
  };
  return sameCustomerOverrides(a.overrides, b.overrides)
    && sameMap(a.oligoOverrides ?? {}, b.oligoOverrides ?? {}) && sameMap(a.addOnOverrides ?? {}, b.addOnOverrides ?? {});
}

export function sameCustomerOverrides(a: CustomerPricing["overrides"], b: CustomerPricing["overrides"]) {
  return ACTIVE_RATE_ITEMS.every(item => a[item.key] === b[item.key]);
}
