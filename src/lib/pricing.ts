import { z } from "zod";
import { MAX_SANGER_REACTIONS, reactionCount, reactionLimit, sampleLimit, type OrderDraft } from "./order-intake";
import { addOnsSchema, DEFAULT_SCHEDULE, getOligoPricing, plasmidRateFor, RATE_ITEMS, rateFor, WHOLE_PLASMID_SIZE_LIMIT_BP, type AddOn, type RateKey, type RateSchedule } from "./rate-schedule";
import { hasStandardOligoPrice, MAX_OLIGOS, oligoPriceNotice, oligoSchema } from "./oligo-schema";

export const PRICING_VERSION = "seqforge-v3-2026-09";
export const RATE_CENTS = {
  Plate: { Standard: 450, "Pre-mixed": 350, "Ready to load": 250 },
  Tubes: { Standard: 550, "Pre-mixed": 450, "Ready to load": 350 },
} as const;
export const WHOLE_PLASMID_UNIT_CENTS = 500;
export const OLIGO_PRICING_VERSION = "seqforge-oligo-length-tiers-2026-11";

export const pricingSchema = z.object({
  version: z.string(), currency: z.literal("USD"),
  unit: z.enum(["reaction", "sample", "oligo", "base"]).default("reaction"),
  pendingQuote: z.boolean().optional(),
  quoteApprovalRequired: z.boolean().optional(),
  knownSubtotalCents: z.number().int().nonnegative().optional(),
  unpricedItems: z.array(z.string()).max(MAX_OLIGOS).optional(),
  customerPricingRevision: z.number().int().nonnegative().optional(),
  lines: z.array(z.object({
    description: z.string(), quantity: z.number().int().positive(),
    unitCents: z.number().int().nonnegative(), amountCents: z.number().int().nonnegative(),
    customPrice: z.boolean().optional(),
    addOnId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).optional(),
    unit: z.enum(["sample", "reaction", "order", "base"]).optional(),
    targets: z.array(z.string().max(500)).max(MAX_SANGER_REACTIONS).optional(),
  })),
  subtotalCents: z.number().int().nonnegative().nullable(),
  reviewReasons: z.array(z.string()),
}).refine(price => {
  if (!price.pendingQuote) return price.subtotalCents !== null && price.knownSubtotalCents === undefined && !price.unpricedItems?.length;
  if (price.subtotalCents !== null) return false;
  if (price.knownSubtotalCents === undefined) return price.lines.length === 0;
  return price.unit === "base" && !!price.unpricedItems?.length && price.lines.length > 0 && price.knownSubtotalCents === price.lines.reduce((sum, line) => sum + line.amountCents, 0);
}, "Pending quotes must keep the final subtotal unknown; any known subtotal covers priced items only.");
export type Pricing = z.infer<typeof pricingSchema>;

export class AddOnSelectionError extends Error {
  constructor(message: string) { super(message); this.name = "AddOnSelectionError"; }
}
export { AddOnSelectionError as InvalidAddOnSelection };
type Selections = { addOnIds?: string[] };
type Sample = OrderDraft["samples"][number];

function appliesToPreparation(item: AddOn, order: OrderDraft, sample?: Sample) {
  if (!item.trigger?.endsWith("requested")) return true;
  if (order.service !== "SANGER" || order.submissionMode !== "Standard" || !sample) return false;
  return item.trigger === "PCR cleanup requested" ? ["PCR product", "Purified PCR product"].includes(sample.templateType) : sample.templateType === "Plasmid DNA";
}

function addOnLines(order: OrderDraft, schedule: RateSchedule): Pricing["lines"] {
  const catalog = addOnsSchema.parse(schedule.addOns ?? []);
  const byId = new Map(catalog.map(item => [item.id, item]));
  const charges = new Map<string, { item: AddOn; targets: string[] }>();
  function collect(value: Selections, scope: AddOn["scope"], target: string, trigger?: string, sample?: Sample) {
    const raw = value.addOnIds ?? [];
    if (!Array.isArray(raw) || raw.length > 30 || new Set(raw).size !== raw.length) throw new AddOnSelectionError("Choose each additional service only once per sample, reaction or order (up to 30 selections).");
    const selected = new Set<string>();
    for (const id of raw) {
      const item = byId.get(id);
      if (!item || !item.active || item.unitCents === null) throw new AddOnSelectionError("An additional service is no longer available. Review your selections before submitting.");
      if (item.service !== order.service || item.scope !== scope || !appliesToPreparation(item, order, sample)) throw new AddOnSelectionError(`${item.name} does not apply to this service, sample type or submission format.`);
      selected.add(id);
    }
    for (const item of catalog) {
      if (trigger && item.active && item.unitCents !== null && item.service === order.service && item.scope === scope && item.trigger === trigger && appliesToPreparation(item, order, sample)) selected.add(item.id);
    }
    for (const id of selected) {
      const item = byId.get(id)!;
      const charge = charges.get(id) ?? { item, targets: [] };
      charge.targets.push(target);
      charges.set(id, charge);
    }
  }
  collect(order as OrderDraft & Selections, "order", "Entire order");
  for (const [sampleIndex, sample] of order.samples.entries()) {
    const label = sample.sampleName.trim() || sample.tubeLabel.trim() || sample.well.trim() || `Sample ${sampleIndex + 1}`;
    collect(sample as Sample & Selections, "sample", `${sampleIndex + 1}. ${label}`, sample.preparation, sample);
    for (const [reactionIndex, reaction] of sample.reactions.entries()) {
      collect(reaction as typeof reaction & Selections, "reaction", `${sampleIndex + 1}. ${label} / reaction ${reactionIndex + 1}${reaction.primerName ? ` (${reaction.primerName})` : ""}`, reaction.specialProtocol, sample);
    }
  }
  return [...charges.values()].map(({ item, targets }) => ({
    description: `${item.name} · per ${item.scope}`,
    quantity: targets.length, unitCents: item.unitCents!, amountCents: targets.length * item.unitCents!,
    addOnId: item.id, unit: item.scope, targets,
    ...(schedule.overriddenAddOnIds?.includes(item.id) ? { customPrice: true } : {}),
  }));
}

export function validateOrderAddOns(order: OrderDraft, schedule: RateSchedule) {
  addOnLines(order, schedule);
}

function hasPricedTrigger(order: OrderDraft, schedule: RateSchedule | undefined, trigger: string, scope: AddOn["scope"], sample?: Sample) {
  return (schedule?.addOns ?? []).some(item => item.active && item.unitCents !== null && item.service === order.service && item.scope === scope && item.trigger === trigger && appliesToPreparation(item, order, sample));
}

function rateVersion(schedule: RateSchedule) {
  return `seqforge-rates-${schedule.revision}${schedule.customerRevision ? `-customer-${schedule.customerRevision}` : ""}`;
}
function customerContext(schedule?: RateSchedule) {
  return schedule?.customerId ? { customerPricingRevision: schedule.customerRevision ?? 0 } : {};
}

export function priceOrder(order: OrderDraft, schedule?: RateSchedule): Pricing {
  const extras = addOnLines(order, schedule ?? DEFAULT_SCHEDULE);
  const base = basePriceOrder(order, schedule);
  if (!extras.length) return base;
  const extraCents = extras.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    ...base, lines: [...base.lines, ...extras],
    subtotalCents: base.subtotalCents === null ? null : base.subtotalCents + extraCents,
    ...(base.pendingQuote ? { knownSubtotalCents: (base.knownSubtotalCents ?? 0) + extraCents } : {}),
  };
}

function basePriceOrder(order: OrderDraft, schedule?: RateSchedule): Pricing {
  if (order.service === "FRAGMENT_ANALYSIS") return { version: "seqforge-fragment-quote-v1", ...customerContext(schedule), currency: "USD", unit: "sample", pendingQuote: true, quoteApprovalRequired: true, lines: [], subtotalCents: null, reviewReasons: ["Fragment Analysis specifications and pricing require laboratory confirmation and customer approval before analysis."] };
  if (order.service === "OLIGO") {
    if (!["Oligo standard", "Oligo modified"].includes(order.submissionMode)) throw new Error("Invalid oligo order.");
    // Normalize and validate again here so billing never counts whitespace,
    // modification text, or invalid letters as DNA bases.
    const items = z.array(oligoSchema).min(1).max(MAX_OLIGOS).parse(order.oligos);
    const config = getOligoPricing(schedule);
    const lines = items.filter(item => hasStandardOligoPrice(item, config)).map(item => {
      const tier = item.sequence.length <= config.shortMaxBases ? "shortUnitCents" : "longUnitCents";
      const unitCents = config[tier]!;
      return { description: `${item.name} · Standard DNA, 25 nmol, Desalted · ${item.sequence.length <= config.shortMaxBases ? `≤${config.shortMaxBases}` : `>${config.shortMaxBases}`} bases`, quantity: item.sequence.length, unitCents, amountCents: item.sequence.length * unitCents, unit: "base" as const, ...(schedule?.overriddenOligoKeys?.includes(tier) ? { customPrice: true } : {}) };
    });
    const unpricedItems = items.filter(item => !hasStandardOligoPrice(item, config)).map(item => item.name);
    const standardSubtotal = lines.reduce((sum, line) => sum + line.amountCents, 0);
    return { version: schedule ? `${OLIGO_PRICING_VERSION}-${rateVersion(schedule)}` : OLIGO_PRICING_VERSION, ...customerContext(schedule), currency: "USD", unit: "base", pendingQuote: !!unpricedItems.length, quoteApprovalRequired: true, lines, subtotalCents: unpricedItems.length ? null : standardSubtotal, ...(unpricedItems.length ? { unpricedItems, ...(lines.length ? { knownSubtotalCents: standardSubtotal } : {}) } : {}), reviewReasons: [oligoPriceNotice(config)] };
  }
  if (order.service === "WHOLE_PLASMID") {
    if (order.submissionMode !== "Whole plasmid" || order.samples.length < 1 || order.samples.length > sampleLimit(order.service)) throw new Error("Invalid whole plasmid order.");
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
  if (order.samples.length > sampleLimit(order.service)) throw new Error(`Pricing supports at most ${sampleLimit(order.service)} physical samples.`);
  const quantity = reactionCount(order.samples);
  if (quantity < 1 || quantity > reactionLimit(order.service)) throw new Error(`Pricing requires 1–${reactionLimit(order.service)} reactions.`);
  const unitCents = schedule ? rateFor(order, schedule) : RATE_CENTS[order.container]?.[order.submissionMode as keyof typeof RATE_CENTS.Tubes];
  if (unitCents === undefined) throw new Error("Unsupported service configuration.");
  const review = new Set<string>();
  if (order.priority !== "Standard") review.add("Same-day handling needs a separate quote.");
  for (const sample of order.samples) {
    if (sample.preparation !== "None requested" && !hasPricedTrigger(order, schedule, sample.preparation, "sample", sample)) review.add("Sample preparation needs a separate quote.");
    for (const reaction of sample.reactions) {
      if (reaction.primerSource === "SeqForge synthesized primer") review.add("Primer synthesis and modifications need a separate quote.");
      if (reaction.specialProtocol !== "None known" && !hasPricedTrigger(order, schedule, reaction.specialProtocol, "reaction", sample)) review.add("Special protocols need price confirmation.");
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
