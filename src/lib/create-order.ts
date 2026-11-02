import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { formatMoney, priceOrder, validateOrderAddOns } from "./pricing";
import type { OrderDraft } from "./order-intake";
import { PriceChanged } from "./pricing-store";
import { getEffectiveRateSchedule, lockCustomerPricing } from "./customer-pricing-store";
import { enqueueInternalNotification, notificationLink } from "./internal-notifications";
import { enqueueCustomerNotification } from "./customer-notifications";
import { lockDropboxSnapshot } from "./dropbox-store";
import { FRAGMENT_HOLD_REASON } from "./fragment-analysis";

export class SubmissionConflict extends Error {}
export class OrderFormOutdated extends Error {
  constructor() { super("This order form has been updated. Your draft is saved in this browser. Refresh the page, continue your saved draft, and review the current prices before submitting."); }
}
export class AccountChanged extends Error {
  constructor() { super("Your signed-in account changed. Reload and review the order with the correct account before submitting."); }
}

export async function createOrder(db: PrismaClient, userId: string, data: OrderDraft, submissionKey: string = randomUUID(), pricingRevision?: number, customerPricingRevision = 0, pricingCustomerId?: string, pricingCatalogVersion: string | null = "2") {
  if (pricingCustomerId !== undefined && pricingCustomerId !== userId) throw new AccountChanged();
  const submissionHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + submissionKey}, 0))`;
    const existing = await tx.order.findUnique({ where: { userId_submissionKey: { userId, submissionKey } }, select: { id: true, orderNumber: true, submissionHash: true } });
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SubmissionConflict("This submission key was already used for a different order.");
      return { id: existing.id, orderNumber: existing.orderNumber };
    }
    // Saved retries remain valid, but an older form cannot review managed fees.
    if (pricingCatalogVersion !== "2") throw new OrderFormOutdated();
    if (data.service === "OLIGO" && data.fulfillment.deliveryMethod === "Dropbox") throw new SubmissionConflict("Oligo synthesis does not accept dropbox delivery.");
    const selectedDropbox = data.fulfillment.deliveryMethod === "Dropbox" ? await lockDropboxSnapshot(tx, data.fulfillment.dropboxId || "", data.fulfillment.dropbox?.revision) : null;
    const { dropbox: _clientDropbox, dropboxId: _clientDropboxId, ...deliveryDetails } = data.fulfillment;
    void _clientDropbox; void _clientDropboxId;
    const fulfillmentSnapshot = { ...deliveryDetails, ...(selectedDropbox ? { dropboxId: selectedDropbox.id, dropbox: selectedDropbox } : {}), sharedResultEmails: [...new Set(data.sharedResultEmails || [])], pickupLocation: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupLocation : "", pickupInstructions: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupInstructions : "" };
    // Lock the rates until the order snapshot is committed; a concurrent price edit waits.
    await lockCustomerPricing(tx, userId);
    await tx.$queryRaw`SELECT id FROM "PricingSchedule" WHERE id = 'active' FOR SHARE`;
    const schedule = await getEffectiveRateSchedule(tx, userId);
    if ((pricingRevision !== undefined && (!Number.isSafeInteger(pricingRevision) || pricingRevision < 1 || pricingRevision !== schedule.revision)) || !Number.isSafeInteger(customerPricingRevision) || customerPricingRevision < 0 || customerPricingRevision !== (schedule.customerRevision ?? 0)) throw new PriceChanged(schedule);
    validateOrderAddOns(data, schedule);
    const pricing = priceOrder(data, schedule);
    const fragment = data.service === "FRAGMENT_ANALYSIS";
    const initialStatus = fragment ? "ON_HOLD" : "SUBMITTED";
    // The temporary number exists only inside this transaction. Allocate the
    // shared monthly counter after bulk writes so a large order does not hold
    // that counter lock while inserting thousands of samples and reactions.
    const pending = await tx.order.create({
      data: {
        orderNumber: `pending-${randomUUID()}`,
        userId, submissionKey, submissionHash, pricingSnapshot: pricing, fulfillmentSnapshot, intakeVersion: 4, orderName: data.orderName,
        service: data.service, priority: data.priority, container: data.container, submissionMode: data.submissionMode,
        ...(fragment ? { fragmentSnapshot: data.fragmentAnalysis, status: initialStatus, holdReason: FRAGMENT_HOLD_REASON, holdPreviousStatus: "SUBMITTED" } : {}),
        ...(data.service === "OLIGO" ? { oligoSnapshot: { items: data.oligos ?? [], shippingAddress: data.oligoShippingAddress ?? "", format: data.oligoFormat ?? "Dry", searchNames: (data.oligos ?? []).map(item => item.name).join("\n") } } : {}),
        poNumber: data.poNumber || null, specialInstructions: data.specialInstructions || null,
        statusHistory: { create: { status: initialStatus, ...(fragment ? { note: FRAGMENT_HOLD_REASON } : {}) } },
      },
      select: { id: true },
    });
    const samples: Prisma.SampleCreateManyInput[] = [];
    const reactions: Prisma.ReactionCreateManyInput[] = [];
    for (const [index, sample] of data.samples.entries()) {
      const { reactions: sampleReactions, addOnIds: _sampleAddOnIds, ...fields } = sample;
      void _sampleAddOnIds;
      const sampleId = randomUUID();
      samples.push({
        ...fields, id: sampleId, orderId: pending.id, position: index + 1,
        tubeLabel: data.container === "Tubes" ? sample.tubeLabel : "",
        plateLabel: data.container === "Plate" ? sample.plateLabel : "",
        well: data.container === "Plate" ? sample.well : "",
        // Compatibility columns only; current screens read Reaction records.
        primerName: sampleReactions[0]?.primerName || "", primerSource: sampleReactions[0]?.primerSource || "",
      });
      for (const [position, reaction] of sampleReactions.entries()) {
        const { addOnIds: _reactionAddOnIds, ...reactionFields } = reaction;
        void _reactionAddOnIds;
        reactions.push({
          ...reactionFields, id: randomUUID(), sampleId, position: position + 1,
          primerConcentration: reaction.primerSource === "Customer supplied" ? reaction.primerConcentration : "",
          storedPrimerReference: reaction.primerSource === "Stored at SeqForge" ? reaction.storedPrimerReference : "",
          primerSequence: reaction.primerSource === "SeqForge synthesized primer" ? reaction.primerSequence : "",
          purification: reaction.primerSource === "SeqForge synthesized primer" ? reaction.purification : "Desalted",
          synthesisScale: reaction.primerSource === "SeqForge synthesized primer" ? reaction.synthesisScale : "25 nmol",
          modification5: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modification5 : "",
          modification3: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modification3 : "",
          modificationInternal: reaction.primerSource === "SeqForge synthesized primer" ? reaction.modificationInternal : "",
        });
      }
    }
    const batchSize = 250;
    for (let offset = 0; offset < samples.length; offset += batchSize) await tx.sample.createMany({ data: samples.slice(offset, offset + batchSize) });
    for (let offset = 0; offset < reactions.length; offset += batchSize) await tx.reaction.createMany({ data: reactions.slice(offset, offset + batchSize) });
    const now = new Date();
    const prefix = `SF-${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const counter = await tx.orderCounter.upsert({ where: { month: prefix }, create: { month: prefix, value: 1 }, update: { value: { increment: 1 } } });
    const order = await tx.order.update({ where: { id: pending.id }, data: { orderNumber: `${prefix}${String(counter.value).padStart(4, "0")}` }, select: { id: true, orderNumber: true } });
    const service = fragment ? "Fragment Analysis (method and quote pending)" : data.service === "OLIGO" ? "Oligo synthesis (final quote pending)" : data.service === "WHOLE_PLASMID" ? "Whole Plasmid" : `Sanger / ${data.submissionMode}`;
    const count = data.service === "OLIGO" ? `Oligos: ${data.oligos?.length ?? 0}` : `Samples: ${data.samples.length}${data.service === "SANGER" ? `\nReactions: ${data.samples.reduce((total, sample) => total + sample.reactions.length, 0)}` : ""}`;
    const deliverySummary = selectedDropbox ? `\nDelivery: Dropbox\nLocation: ${selectedDropbox.name}\nAddress: ${selectedDropbox.address}\nPlacement: ${selectedDropbox.placementInstructions || "Contact SeqForge to confirm the exact dropbox position before depositing samples."}\nPickup: ${selectedDropbox.pickupSchedule || "Contact SeqForge to confirm the collection schedule."}\n${selectedDropbox.accessNotes ? `Access: ${selectedDropbox.accessNotes}\n` : ""}${fragment ? "Confirm sample preparation with the laboratory before depositing your samples." : "Place labelled samples with the printed order manifest in the selected SeqForge dropbox."}\n` : "";
    const priceLines = pricing.lines.map(line => `${line.description}: ${line.quantity} ${line.unit || pricing.unit} × ${formatMoney(line.unitCents)} = ${formatMoney(line.amountCents)}${line.targets?.length ? `\nApplies to: ${line.targets.length <= 12 ? line.targets.join("; ") : `${line.targets.length} ${line.unit || "item"}s. See the order link below for the complete list.`}` : ""}`).join("\n");
    const oligoEstimate = fragment ? `\nStatus: Awaiting laboratory confirmation\nPrice: Quote pending\n${FRAGMENT_HOLD_REASON}\nDyes: ${data.fragmentAnalysis!.dyes}\nExpected range: ${data.fragmentAnalysis!.minSize}–${data.fragmentAnalysis!.maxSize} bp\nRequested size standard: ${data.fragmentAnalysis!.sizeStandard || "Laboratory recommendation"}\nRequested results: ${data.fragmentAnalysis!.resultRequest}\n` : data.service === "OLIGO" ? `\n${pricing.lines.length ? `Priced synthesis and selected services ${pricing.pendingQuote ? "subtotal only" : "estimate"}: ${formatMoney(pricing.knownSubtotalCents ?? pricing.subtotalCents)} USD.\n${priceLines}\n` : ""}${pricing.pendingQuote ? `Final order total: Quote pending. Separate pricing is required for ${pricing.unpricedItems?.length ?? 0} oligo(s) requiring specification review.\n` : ""}Final specifications, delivery form, taxes and shipping require laboratory confirmation and customer approval before production.\n` : pricing.lines.some(line => line.addOnId) ? `\nOrder estimate: ${formatMoney(pricing.subtotalCents)} USD.\n${priceLines}\nTaxes, shipping and requests requiring a separate quote are excluded.\n` : "";
    await enqueueInternalNotification(tx, {
      eventKey: `order:${order.id}`, kind: "NEW_ORDER", subject: `New order ${order.orderNumber}`,
      text: `A new order has been saved.\n\nOrder: ${order.orderNumber}\nService: ${service}\n${count}\n${deliverySummary}${oligoEstimate}\nReview order:\n${notificationLink(`/admin/orders/${encodeURIComponent(order.id)}`)}\n\nInternal staff notification only.`,
    });
    const customer = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (customer) await enqueueCustomerNotification(tx, {
      eventKey: `order:${order.id}`, userId, kind: "ORDER_CONFIRMATION", recipient: customer.email,
      subject: `Order received: ${order.orderNumber}`,
      text: `Your SeqForge order is in. Thank you for trusting us with your science.\n\nOrder: ${order.orderNumber}\nService: ${service}\n${count}\nStatus: ${fragment ? "Awaiting laboratory confirmation" : "Submitted"}\n${deliverySummary}${oligoEstimate}\nView your order and submission details:\n${notificationLink(`/orders/${encodeURIComponent(order.id)}`)}\n\nThis confirms that your order was saved. It does not confirm payment${data.service === "OLIGO" ? ". No DNA samples need to be sent for oligo synthesis." : " or sample receipt. Please follow the submission instructions on your order page."}`,
    });
    return order;
  }, { maxWait: 10_000, timeout: 20_000 });
}
