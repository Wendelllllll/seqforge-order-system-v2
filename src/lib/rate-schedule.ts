import { z } from "zod";

export const RATE_ITEMS = [
  { key: "sanger-standard-tubes", service: "Sanger", mode: "Standard", container: "Tubes", unit: "reaction", cents: 550 },
  { key: "sanger-standard-plate", service: "Sanger", mode: "Standard", container: "Plate", unit: "reaction", cents: 450 },
  { key: "sanger-premixed-tubes", service: "Sanger", mode: "Pre-mixed", container: "Tubes", unit: "reaction", cents: 450 },
  { key: "sanger-premixed-plate", service: "Sanger", mode: "Pre-mixed", container: "Plate", unit: "reaction", cents: 350 },
  { key: "sanger-ready-tubes", service: "Sanger", mode: "Ready to load", container: "Tubes", unit: "reaction", cents: 350 },
  { key: "sanger-ready-plate", service: "Sanger", mode: "Ready to load", container: "Plate", unit: "reaction", cents: 250 },
  { key: "plasmid-tubes", service: "Whole Plasmid", mode: "Whole plasmid", container: "Tubes", unit: "sample", cents: 500 },
  { key: "plasmid-plate", service: "Whole Plasmid", mode: "Whole plasmid", container: "Plate", unit: "sample", cents: 500 },
  { key: "plasmid-large-tubes", service: "Whole Plasmid", mode: "Whole plasmid >12 kb", container: "Tubes", unit: "sample", cents: 1500 },
  { key: "plasmid-large-plate", service: "Whole Plasmid", mode: "Whole plasmid >12 kb", container: "Plate", unit: "sample", cents: 1500 },
] as const;
// Retired rates remain readable for saved quotes and historical order snapshots.
export const ACTIVE_RATE_ITEMS = RATE_ITEMS.filter(item => item.mode !== "Ready to load");
export type RateKey = typeof RATE_ITEMS[number]["key"];
const keys = RATE_ITEMS.map(item => item.key) as [RateKey, ...RateKey[]];
const rateAmount = z.number().int().min(0).max(1_000_000);
export const ratesSchema = z.record(z.enum(keys), rateAmount);
// History is immutable and earlier revisions contain only the original eight rates.
export const historicalRatesSchema = z.partialRecord(z.enum(keys), rateAmount);
export const rateScheduleSchema = z.object({
  revision: z.number().int().positive(), rates: ratesSchema,
  customerId: z.string().min(1).max(128).optional(),
  customerRevision: z.number().int().nonnegative().optional(),
  overriddenKeys: z.array(z.enum(keys)).max(RATE_ITEMS.length).optional(),
});
export type RateSchedule = z.infer<typeof rateScheduleSchema>;
export const DEFAULT_SCHEDULE: RateSchedule = { revision: 1, rates: Object.fromEntries(RATE_ITEMS.map(item => [item.key, item.cents])) as RateSchedule["rates"] };
export const priceUpdateSchema = z.object({ revision: z.number().int().positive(), rates: ratesSchema, reason: z.string().trim().min(1).max(500) }).strict();
const legacyRatesSchema = z.record(z.enum(keys.filter(key => !key.startsWith("plasmid-large-")) as [RateKey, ...RateKey[]]), rateAmount);
// Preserve a pre-tier draft's original flat quote so it can be compared with today's rates.
export const savedRateScheduleSchema = z.union([rateScheduleSchema, z.object({ revision: z.number().int().positive(), rates: legacyRatesSchema }).transform(({ revision, rates }) => ({
  revision, rates: { ...rates, "plasmid-large-tubes": rates["plasmid-tubes"], "plasmid-large-plate": rates["plasmid-plate"] },
}))]);
export const WHOLE_PLASMID_SIZE_LIMIT_BP = 12_000;
export function plasmidRateFor(container: string, large: boolean, schedule: RateSchedule) {
  if (container !== "Tubes" && container !== "Plate") throw new Error("Unsupported sample format.");
  const key = `plasmid-${large ? "large-" : ""}${container === "Tubes" ? "tubes" : "plate"}` as RateKey;
  return schedule.rates[key];
}
export function rateFor(order: { container: string; submissionMode: string }, schedule: RateSchedule) {
  const item = RATE_ITEMS.find(item => item.container === order.container && item.mode === order.submissionMode);
  if (!item) throw new Error("Unsupported service configuration.");
  return schedule.rates[item.key];
}
export function dollarsToCents(value: string) {
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(value.trim())) throw new Error("Use a USD amount with up to two decimal places.");
  const cents = Math.round(Number(value) * 100);
  if (cents > 1_000_000) throw new Error("The maximum unit price is $10,000.");
  return cents;
}
