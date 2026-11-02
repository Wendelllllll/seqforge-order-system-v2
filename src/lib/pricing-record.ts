import { z } from "zod";
import { addOnsSchema, historicalRatesSchema, oligoPricingSchema, type RateSchedule } from "./rate-schedule";

const recordSchema = z.object({
  format: z.literal(2), rates: historicalRatesSchema,
  oligo: oligoPricingSchema, addOns: addOnsSchema,
}).strict();

/** Both current storage and audit history use this envelope; old flat histories stay readable. */
export function readPricingRecord(value: unknown) {
  if (value && typeof value === "object" && "format" in value) return recordSchema.parse(value);
  return { format: 1 as const, rates: historicalRatesSchema.parse(value), oligo: undefined, addOns: undefined };
}

export function pricingRecord(schedule: Pick<RateSchedule, "rates" | "oligo" | "addOns">) {
  return recordSchema.parse({ format: 2, rates: schedule.rates, oligo: schedule.oligo, addOns: schedule.addOns });
}
