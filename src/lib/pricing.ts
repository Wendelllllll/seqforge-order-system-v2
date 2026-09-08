import { z } from "zod";
import { reactionCount, type OrderDraft } from "./order-intake";

export const PRICING_VERSION = "seqforge-v3-2026-09";
export const RATE_CENTS = {
  Plate: { Standard: 450, "Pre-mixed": 350, "Ready to load": 250 },
  Tubes: { Standard: 550, "Pre-mixed": 450, "Ready to load": 350 },
} as const;

export const pricingSchema = z.object({
  version: z.string(), currency: z.literal("USD"),
  lines: z.array(z.object({
    description: z.string(), quantity: z.number().int().positive(),
    unitCents: z.number().int().nonnegative(), amountCents: z.number().int().nonnegative(),
  })),
  subtotalCents: z.number().int().nonnegative(),
  reviewReasons: z.array(z.string()),
});
export type Pricing = z.infer<typeof pricingSchema>;

export function priceOrder(order: OrderDraft): Pricing {
  const quantity = reactionCount(order.samples);
  if (quantity < 1 || quantity > 250) throw new Error("Pricing requires 1–250 reactions.");
  const unitCents = RATE_CENTS[order.container]?.[order.submissionMode];
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
  return {
    version: PRICING_VERSION, currency: "USD",
    lines: [{ description: `Sanger sequencing · ${order.container} · ${order.submissionMode}`, quantity, unitCents, amountCents: quantity * unitCents }],
    subtotalCents: quantity * unitCents, reviewReasons: [...review],
  };
}
export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
