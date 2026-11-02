import { z } from "zod";
import { reactionCount, type OrderDraft } from "./order-intake";
import { DEFAULT_SCHEDULE, plasmidRateFor, RATE_ITEMS, rateFor, WHOLE_PLASMID_SIZE_LIMIT_BP, type RateKey, type RateSchedule } from "./rate-schedule";
import { hasStandardOligoPrice, MAX_OLIGOS, OLIGO_BASE_PRICE_NOTICE, OLIGO_BASE_RATE_CENTS, oligoSchema } from "./oligo-schema";

export const PRICING_VERSION = "seqforge-v3-2026-09";
export const RATE_CENTS = {
  Plate: { Standard: 450, "Pre-mixed": 350, "Ready to load": 250 },
  Tubes: { Standard: 550, "Pre-mixed": 450, "Ready to load": 350 },
} as const;
export const WHOLE_PLASMID_UNIT_CENTS = 500;
export const OLIGO_PRICING_VERSION = "seqforge-oligo-standard-under60-25c-2026-11";

export const pricingSchema = z.object({
  version: z.string(), currency: z.literal("USD"),
  unit: z.enum(["reaction", "sample", "oligo", "base"]).default("reaction"),
  pendingQuote: z.boolean().optional(),
  quoteApprovalRequired: z.boolean().optional(),
  knownSubtotalCents: z.number().int().positive().optional(),
  unpricedItems: z.array(z.string()).max(MAX_OLIGOS).optional(),
  customerPricingRevision: z.number().int().nonnegative().optional(),
  lines: z.array(z.object({
    description: z.string(), quantity: z.number().int().positive(),
    unitCents: z.number().int().nonnegative(), amountCents: z.number().int().nonnegative(),
    customPrice: z.boolean().optional(),
  })),
  subtotalCents: z.number().int().nonnegative().nullable(),
  reviewReasons: z.array(z.string()),
}).refine(price => {
  if (!price.pendingQuote) return price.subtotalCents !== null && price.knownSubtotalCents === undefined && !price.unpricedItems?.length;
  if (price.subtotalCents !== null) return false;
  if (price.knownSubtotalCents === undefined) return price.lines.length === 0;
  return price.unit === "base" && !!price.unpricedItems?.length && price.lines.length > 0 && price.knownSubtotalCents === price.lines.reduce((sum, line) => sum + line.amountCents, 0);
}, "Pending quotes must keep the final subtotal unknown; any known subtotal covers priced standard oligos only.");
export type Pricing = z.infer<typeof pricingSchema>;

function rateVersion(schedule: RateSchedule) {
  return `seqforge-rates-${schedule.revision}${schedule.customerRevision ? `-customer-${schedule.customerRevision}` : ""}`;
}
function customerContext(schedule?: RateSchedule) {
  return schedule?.customerId ? { customerPricingRevision: schedule.customerRevision ?? 0 } : {};
}

export function priceOrder(order: OrderDraft, schedule?: RateSchedule): Pricing {
  if (order.service === "OLIGO") {
    if (!["Oligo standard", "Oligo modified"].includes(order.submissionMode)) throw new Error("Invalid oligo order.");
    // Normalize and validate again here so billing never counts whitespace,
    // modification text, or invalid letters as DNA bases.
    const items = z.array(oligoSchema).min(1).max(MAX_OLIGOS).parse(order.oligos);
    const lines = items.filter(hasStandardOligoPrice).map(item => ({ description: `${item.name} · Standard DNA, 25 nmol, Desalted`, quantity: item.sequence.length, unitCents: OLIGO_BASE_RATE_CENTS, amountCents: item.sequence.length * OLIGO_BASE_RATE_CENTS }));
    const unpricedItems = items.filter(item => !hasStandardOligoPrice(item)).map(item => item.name);
    const standardSubtotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
    return { version: OLIGO_PRICING_VERSION, currency: "USD", unit: "base", pendingQuote: !!unpricedItems.length, quoteApprovalRequired: true, lines, subtotalCents: unpricedItems.length ? null : standardSubtotal, ...(unpricedItems.length ? { unpricedItems, ...(lines.length ? { knownSubtotalCents: standardSubtotal } : {}) } : {}), reviewReasons: [OLIGO_BASE_PRICE_NOTICE] };
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
