import { z } from "zod";
import { ACTIVE_RATE_ITEMS, type RateKey, type RateSchedule } from "./rate-schedule";

const keys = ACTIVE_RATE_ITEMS.map(item => item.key) as [RateKey, ...RateKey[]];
export const customerOverridesSchema = z.partialRecord(z.enum(keys), z.number().int().min(0).max(1_000_000));
export const customerPricingSchema = z.object({
  customerId: z.string().min(1).max(128),
  revision: z.number().int().nonnegative(),
  overrides: customerOverridesSchema,
});
export type CustomerPricing = z.infer<typeof customerPricingSchema>;
export const customerPriceUpdateSchema = z.object({
  revision: z.number().int().nonnegative(),
  overrides: customerOverridesSchema,
  reason: z.string().trim().min(1, "Give a reason for this price change.").max(500),
}).strict();

export function composeCustomerRates(schedule: RateSchedule, pricing: CustomerPricing): RateSchedule {
  return {
    revision: schedule.revision,
    rates: { ...schedule.rates, ...pricing.overrides },
    customerId: pricing.customerId,
    customerRevision: pricing.revision,
    overriddenKeys: ACTIVE_RATE_ITEMS.filter(item => pricing.overrides[item.key] !== undefined).map(item => item.key),
  };
}

export function sameCustomerOverrides(a: CustomerPricing["overrides"], b: CustomerPricing["overrides"]) {
  return ACTIVE_RATE_ITEMS.every(item => a[item.key] === b[item.key]);
}
