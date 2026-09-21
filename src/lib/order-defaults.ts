import { z } from "zod";

export const PAYMENT_METHODS = ["Invoice", "Purchase order"] as const;
export const DELIVERY_METHODS = ["Pickup", "Ship to SeqForge"] as const;
export const orderDefaultsSchema = z.object({
  deliveryMethod: z.enum(DELIVERY_METHODS),
  pickupLocation: z.string().trim().max(500),
  pickupInstructions: z.string().trim().max(500),
  contactName: z.string().trim().max(120),
  contactPhone: z.string().trim().max(60),
  piName: z.string().trim().max(120),
  billingOrganization: z.string().trim().max(200),
  billingContactName: z.string().trim().max(120),
  billingEmail: z.union([z.literal(""), z.string().trim().email().max(254)]),
  billingAddress: z.string().trim().max(1000),
  paymentMethod: z.enum(PAYMENT_METHODS),
});
export type OrderDefaults = z.infer<typeof orderDefaultsSchema>;
export function blankDefaults(): OrderDefaults {
  return { deliveryMethod: "Pickup", pickupLocation: "", pickupInstructions: "", contactName: "", contactPhone: "", piName: "", billingOrganization: "", billingContactName: "", billingEmail: "", billingAddress: "", paymentMethod: "Invoice" };
}
export function readDefaults(value: unknown): OrderDefaults {
  const parsed = orderDefaultsSchema.safeParse(value);
  return parsed.success ? parsed.data : blankDefaults();
}
