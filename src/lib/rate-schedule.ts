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
export const oligoPricingSchema = z.object({
  shortMaxBases: z.number().int().min(1).max(500),
  shortUnitCents: rateAmount,
  // null exists only to preserve saved quotes from before long-oligo pricing.
  longUnitCents: rateAmount.nullable(),
}).strict();
export const currentOligoPricingSchema = oligoPricingSchema.extend({ longUnitCents: rateAmount });
export type OligoPricing = z.infer<typeof oligoPricingSchema>;
export const DEFAULT_OLIGO_PRICING: OligoPricing = { shortMaxBases: 60, shortUnitCents: 25, longUnitCents: 70 };
export const LEGACY_OLIGO_PRICING: OligoPricing = { shortMaxBases: 59, shortUnitCents: 25, longUnitCents: null };
export const ADD_ON_TRIGGERS = ["Miniprep requested", "PCR cleanup requested", "GC-rich", "RNAi", "PolyA", "Dinucleotide repeat"] as const;
export const addOnSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  name: z.string().trim().min(1).max(100),
  service: z.enum(["SANGER", "WHOLE_PLASMID", "OLIGO"]),
  scope: z.enum(["sample", "reaction", "order"]),
  unitCents: rateAmount.nullable(),
  active: z.boolean(),
  trigger: z.enum(ADD_ON_TRIGGERS).nullable().optional(),
}).strict().superRefine((item, ctx) => {
  if (item.active && item.unitCents === null) ctx.addIssue({ code: "custom", path: ["unitCents"], message: "Set a price before enabling this service." });
  if (item.scope === "reaction" && item.service !== "SANGER") ctx.addIssue({ code: "custom", path: ["scope"], message: "Per-reaction charges apply only to Sanger." });
  if (item.service === "OLIGO" && item.scope !== "order") ctx.addIssue({ code: "custom", path: ["scope"], message: "Oligo add-ons currently apply per order." });
  if (item.trigger) {
    const scope = item.trigger.endsWith("requested") ? "sample" : "reaction";
    if (item.service !== "SANGER" || item.scope !== scope) ctx.addIssue({ code: "custom", path: ["trigger"], message: `This automatic selection applies to Sanger per ${scope}.` });
  }
});
export type AddOn = z.infer<typeof addOnSchema>;
export const addOnsSchema = z.array(addOnSchema).max(50).superRefine((items, ctx) => {
  const ids = new Set<string>();
  const triggers = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: [index, "id"], message: "Each additional service needs a unique ID." });
    ids.add(item.id);
    if (item.active && item.trigger) {
      const key = `${item.service}:${item.scope}:${item.trigger}`;
      if (triggers.has(key)) ctx.addIssue({ code: "custom", path: [index, "trigger"], message: "Only one enabled charge may match each automatic selection." });
      triggers.add(key);
    }
  }
});
export const DEFAULT_ADD_ONS: AddOn[] = [
  { id: "pcr-cleanup", name: "PCR cleanup", service: "SANGER", scope: "sample", unitCents: null, active: false, trigger: "PCR cleanup requested" },
  { id: "gc-rich", name: "GC-rich sequencing", service: "SANGER", scope: "reaction", unitCents: null, active: false, trigger: "GC-rich" },
  { id: "polya", name: "PolyA sequencing", service: "SANGER", scope: "reaction", unitCents: null, active: false, trigger: "PolyA" },
];
export const ratesSchema = z.record(z.enum(keys), rateAmount);
// History is immutable and earlier revisions contain only the original eight rates.
export const historicalRatesSchema = z.partialRecord(z.enum(keys), rateAmount);
export const rateScheduleSchema = z.object({
  revision: z.number().int().positive(), rates: ratesSchema,
  oligo: oligoPricingSchema.optional(),
  addOns: addOnsSchema.optional(),
  customerId: z.string().min(1).max(128).optional(),
  customerRevision: z.number().int().nonnegative().optional(),
  overriddenKeys: z.array(z.enum(keys)).max(RATE_ITEMS.length).optional(),
  overriddenOligoKeys: z.array(z.enum(["shortUnitCents", "longUnitCents"])).max(2).optional(),
  overriddenAddOnIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)).max(50).optional(),
});
export type RateSchedule = z.infer<typeof rateScheduleSchema>;
export const DEFAULT_SCHEDULE: RateSchedule = { revision: 1, rates: Object.fromEntries(RATE_ITEMS.map(item => [item.key, item.cents])) as RateSchedule["rates"], oligo: DEFAULT_OLIGO_PRICING, addOns: DEFAULT_ADD_ONS };
export const priceUpdateSchema = z.object({ revision: z.number().int().positive(), rates: ratesSchema, oligo: currentOligoPricingSchema.optional(), addOns: addOnsSchema.optional(), reason: z.string().trim().min(1).max(500) }).strict();
const legacyRatesSchema = z.record(z.enum(keys.filter(key => !key.startsWith("plasmid-large-")) as [RateKey, ...RateKey[]]), rateAmount);
// Preserve a pre-tier draft's original flat quote so it can be compared with today's rates.
export const savedRateScheduleSchema = z.union([rateScheduleSchema, z.object({ revision: z.number().int().positive(), rates: legacyRatesSchema }).transform(({ revision, rates }) => ({
  revision, rates: { ...rates, "plasmid-large-tubes": rates["plasmid-tubes"], "plasmid-large-plate": rates["plasmid-plate"] },
}))]).transform((schedule): RateSchedule => ({ ...schedule, oligo: "oligo" in schedule && schedule.oligo ? schedule.oligo : LEGACY_OLIGO_PRICING, addOns: "addOns" in schedule && schedule.addOns ? schedule.addOns : [] }));
export function getOligoPricing(schedule?: Pick<RateSchedule, "oligo">): OligoPricing {
  return schedule?.oligo ?? DEFAULT_OLIGO_PRICING;
}
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
