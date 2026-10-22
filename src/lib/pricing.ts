import { z } from "zod";
import { reactionCount, type OrderDraft } from "./order-intake";
import { DEFAULT_SCHEDULE, plasmidRateFor, RATE_ITEMS, rateFor, WHOLE_PLASMID_SIZE_LIMIT_BP, type RateKey, type RateSchedule } from "./rate-schedule";
import { OLIGO_QUOTE_NOTICE } from "./oligo-schema";

export const PRICING_VERSION = "seqforge-v3-2026-09";
export const RATE_CENTS = {
  Plate: { Standard: 450, "Pre-mixed": 350, "Ready to load": 250 },
  Tubes: { Standard: 550, "Pre-mixed": 450, "Ready to load": 350 },
} as const;
export const WHOLE_PLASMID_UNIT_CENTS = 500;

export const pricingSchema = z.object({
  version: z.string(), currency: z.literal("USD"),
  unit: z.enum(["reaction", "sample", "oligo"]).default("reaction"),
  pendingQuote: z.boolean().optional(),
  customerPricingRevision: z.number().int().nonnegative().optional(),
  lines: z.array(z.object({
    description: z.string(), quantity: z.number().int().positive(),
    unitCents: z.number().int().nonnegative(), amountCents: z.number().int().nonnegative(),
    customPrice: z.boolean().optional(),
  })),
  subtotalCents: z.number().int().nonnegative().nullable(),
  reviewReasons: z.array(z.string()),
}).refine(price => price.pendingQuote ? price.subtotalCents === null && price.lines.length === 0 : price.subtotalCents !== null, "Pending quotes cannot have a charge; priced orders require a subtotal.");
export type Pricing = z.infer<typeof pricingSchema>;

function rateVersion(schedule: RateSchedule) {
  return `seqforge-rates-${schedule.revision}${schedule.customerRevision ? `-customer-${schedule.customerRevision}` : ""}`;
}
function customerContext(schedule?: RateSchedule) {
  return schedule?.customerId ? { customerPricingRevision: schedule.customerRevision ?? 0 } : {};
}

export function priceOrder(order: OrderDraft, schedule?: RateSchedule): Pricing {
  if (order.service === "OLIGO") {
    if (!["Oligo standard", "Oligo modified"].includes(order.submissionMode) || !order.oligos?.length || order.oligos.length > 250) throw new Error("Invalid oligo order.");
    return { version: "seqforge-oligo-quote-2026-10", currency: "USD", unit: "oligo", pendingQuote: true, lines: [], subtotalCents: null, reviewReasons: [OLIGO_QUOTE_NOTICE] };
  }
  if (order.service === "WHOLE_PLASMID") {
    if (order.submissionMode !== "Whole plasmid" || order.samples.length < 1 || order.samples.length > 250) throw new Error("Invalid whole plasmid order.");
    const counts = { small: 0, large: 0, unknown: 0 };
    for (const sample of order.samples) {
      const text = sample.templateLength.trim();
      const size = Number(text);
      // Unfinished form values remain an estimate; orderSchema validates them on submission.
      const known = /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number.isSafeInteger(size) && size > 0;
      counts[!known ? "unknown" : size > WHOLE_PLASMID_SIZE_LIMIT_BP ? "large" : "small"]++;
    }
    const labels = { small: "≤12 kb", large: ">12 kb", unknown: "Size not confirmed · base estimate" };
    const lines = (["small", "large", "unknown"] as const).flatMap(tier => {
      const quantity = counts[tier];
      if (!quantity) return [];
      const unitCents = plasmidRateFor(order.container, tier === "large", schedule ?? DEFAULT_SCHEDULE);
      const key = `plasmid-${tier === "large" ? "large-" : ""}${order.container === "Plate" ? "plate" : "tubes"}` as RateKey;
      return [{ description: `Whole Plasmid Sequencing · ${order.container} · ${labels[tier]}`, quantity, unitCents, amountCents: quantity * unitCents, ...(schedule?.overriddenKeys?.includes(key) ? { customPrice: true } : {}) }];
    });
    const reviewReasons: string[] = [];
    if (counts.unknown) reviewReasons.push("Samples without a confirmed size use the ≤12 kb base rate as an estimate. The lab must confirm size and the applicable price before processing; samples above 12,000 bp use the >12 kb rate.");
    if (order.priority !== "Standard" || order.specialInstructions.trim()) reviewReasons.push("Additional requests require lab confirmation.");
    return { version: schedule ? rateVersion(schedule) : "seqforge-whole-plasmid-size-tiers-2026-10", ...customerContext(schedule), currency: "USD", unit: "sample", lines, subtotalCents: lines.reduce((sum, line) => sum + line.amountCents, 0), reviewReasons };
  }
  if (!["Standard", "Pre-mixed", "Ready to load"].includes(order.submissionMode)) throw new Error("Unsupported service configuration.");
  const quantity = reactionCount(order.samples);
  if (quantity < 1 || quantity > 250) throw new Error("Pricing requires 1–250 reactions.");
  const unitCents = schedule ? rateFor(order, schedule) : RATE_CENTS[order.container]?.[order.submissionMode as keyof typeof RATE_CENTS.Tubes];
  if (unitCents === undefined) throw new Error("Unsupported service configuration.");
  const review = new Set<string>();
  if (order.priority !== "Standard") review.add("Same-day handling needs a separate quote.");
  for (const sample of order.samples) {
    if (sample.preparation !== "None requested") review.add("Sample preparation needs a separate quote.");
    for (const reaction of sample.reactions) {
      if (reaction.primerSource === "SeqForge synthesized primer") review.add("Primer synthesis and modifications need a separate quote.");
      if (reaction.specialProtocol !== "None known") review.add("Special protocols need price confirmation.");
    }
  }
  if (order.specialInstructions.trim()) review.add("Additional instructions need review for any additional charges.");
  const key = RATE_ITEMS.find(item => item.container === order.container && item.mode === order.submissionMode)?.key;
  return {
    version: schedule ? rateVersion(schedule) : PRICING_VERSION, ...customerContext(schedule), currency: "USD", unit: "reaction",
    lines: [{ description: `Sanger sequencing · ${order.container} · ${order.submissionMode}`, quantity, unitCents, amountCents: quantity * unitCents, ...(key && schedule?.overriddenKeys?.includes(key) ? { customPrice: true } : {}) }],
    subtotalCents: quantity * unitCents, reviewReasons: [...review],
  };
}
export function formatMoney(cents: number | null) {
  if (cents === null) return "Quote pending";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
