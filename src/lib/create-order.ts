import type { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { priceOrder } from "./pricing";
import type { OrderDraft } from "./order-intake";
import { getRateSchedule, PriceChanged } from "./pricing-store";
import { getEffectiveRateSchedule, lockCustomerPricing } from "./customer-pricing-store";
import { enqueueInternalNotification, notificationLink } from "./internal-notifications";
import { enqueueCustomerNotification } from "./customer-notifications";

export class SubmissionConflict extends Error {}
export class AccountChanged extends Error {
  constructor() { super("Your signed-in account changed. Reload and review the order with the correct account before submitting."); }
}

export async function createOrder(db: PrismaClient, userId: string, data: OrderDraft, submissionKey: string = randomUUID(), pricingRevision?: number, customerPricingRevision = 0, pricingCustomerId?: string) {
  if (pricingCustomerId !== undefined && pricingCustomerId !== userId) throw new AccountChanged();
  const submissionHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + submissionKey}, 0))`;
    const existing = await tx.order.findUnique({ where: { userId_submissionKey: { userId, submissionKey } }, select: { id: true, orderNumber: true, submissionHash: true } });
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SubmissionConflict("This submission key was already used for a different order.");
      return { id: existing.id, orderNumber: existing.orderNumber };
    }
    // Lock the rates until the order snapshot is committed; a concurrent price edit waits.
    if (data.service !== "OLIGO") await lockCustomerPricing(tx, userId);
    await tx.$queryRaw`SELECT id FROM "PricingSchedule" WHERE id = 'active' FOR SHARE`;
    const schedule = data.service === "OLIGO" ? await getRateSchedule(tx) : await getEffectiveRateSchedule(tx, userId);
    if (data.service !== "OLIGO" && ((pricingRevision !== undefined && pricingRevision !== schedule.revision) || customerPricingRevision !== schedule.customerRevision)) throw new PriceChanged(schedule);
    const now = new Date();
    const prefix = `SF-${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const counter = await tx.orderCounter.upsert({ where: { month: prefix }, create: { month: prefix, value: 1 }, update: { value: { increment: 1 } } });
    const order = await tx.order.create({
      data: {
        orderNumber: `${prefix}${String(counter.value).padStart(4, "0")}`,
        userId, submissionKey, submissionHash, pricingSnapshot: priceOrder(data, schedule), fulfillmentSnapshot: { ...data.fulfillment, sharedResultEmails: [...new Set(data.sharedResultEmails || [])], pickupLocation: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupLocation : "", pickupInstructions: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupInstructions : "" }, intakeVersion: 4, orderName: data.orderName,
        service: data.service, priority: data.priority, container: data.container, submissionMode: data.submissionMode,
        ...(data.service === "OLIGO" ? { oligoSnapshot: { items: data.oligos ?? [], shippingAddress: data.oligoShippingAddress ?? "", format: data.oligoFormat ?? "Dry", searchNames: (data.oligos ?? []).map(item => item.name).join("\n") } } : {}),
        poNumber: data.poNumber || null, specialInstructions: data.specialInstructions || null,
        samples: { create: data.samples.map((sample, index) => {
          const { reactions, ...fields } = sample;
          return {
            ...fields,
            tubeLabel: data.container === "Tubes" ? sample.tubeLabel : "",
            plateLabel: data.container === "Plate" ? sample.plateLabel : "",
            well: data.container === "Plate" ? sample.well : "",
            // Compatibility columns only; current screens read Reaction records.
            primerName: reactions[0]?.primerName || "", primerSource: reactions[0]?.primerSource || "",
            position: index + 1,
            reactions: { create: reactions.map((reaction, position) => ({
              ...reaction, position: position + 1,
              primerConcentration: reaction.primerSource === "Customer supplied" ? reaction.primerConcentration : "",
              storedPrimerReference: reaction.primerSource === "Stored at SeqForge" ? reaction.storedPrimerReference : "",
              primerSequence: reaction.primerSource === "SeqForge synthesized primer" ? reaction.primerSequence : "",
              purification: reaction.primerSource === "SeqForge synthesized primer" ? reaction.purification : "Desalted",
              synthesisScale: reaction.primerSource === "SeqForge synthesized primer" ? reaction.synthesisScale : "25 nmol",
              modification5: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modification5 : "",
              modification3: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modification3 : "",
              modificationInternal: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modificationInternal : "",
            })) },
          };
        }) },
        statusHistory: { create: { status: "SUBMITTED" } },
      },
      select: { id: true, orderNumber: true },
    });
    const service = data.service === "OLIGO" ? "Oligo synthesis (quote pending)" : data.service === "WHOLE_PLASMID" ? "Whole Plasmid" : `Sanger / ${data.submissionMode}`;
    const count = data.service === "OLIGO" ? `Oligos: ${data.oligos?.length ?? 0}` : `Samples: ${data.samples.length}${data.service === "SANGER" ? `\nReactions: ${data.samples.reduce((total, sample) => total + sample.reactions.length, 0)}` : ""}`;
    await enqueueInternalNotification(tx, {
      eventKey: `order:${order.id}`, kind: "NEW_ORDER", subject: `New order ${order.orderNumber}`,
      text: `A new order has been saved.\n\nOrder: ${order.orderNumber}\nService: ${service}\n${count}\n\nReview order:\n${notificationLink(`/admin/orders/${encodeURIComponent(order.id)}`)}\n\nInternal staff notification only.`,
    });
    const customer = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (customer) await enqueueCustomerNotification(tx, {
      eventKey: `order:${order.id}`, userId, kind: "ORDER_CONFIRMATION", recipient: customer.email,
      subject: `Order received: ${order.orderNumber}`,
      text: `Your SeqForge order is in. Thank you for trusting us with your science.\n\nOrder: ${order.orderNumber}\nService: ${service}\n${count}\nStatus: Submitted\n${data.service === "OLIGO" ? "\nPricing is pending laboratory confirmation. Production begins after the quote is confirmed.\n" : ""}\nView your order and submission details:\n${notificationLink(`/orders/${encodeURIComponent(order.id)}`)}\n\nThis confirms that your order was saved. It does not confirm payment or sample receipt. Please follow the submission instructions on your order page.`,
    });
    return order;
  }, { maxWait: 10_000, timeout: 20_000 });
}
