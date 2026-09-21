import type { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { priceOrder } from "./pricing";
import type { OrderDraft } from "./order-intake";

export class SubmissionConflict extends Error {}
export class DuplicateOrderName extends Error {}

export async function createOrder(db: PrismaClient, userId: string, data: OrderDraft, submissionKey: string = randomUUID()) {
  const submissionHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + submissionKey}, 0))`;
    const existing = await tx.order.findUnique({ where: { userId_submissionKey: { userId, submissionKey } }, select: { id: true, orderNumber: true, submissionHash: true } });
    if (existing) {
      if (existing.submissionHash !== submissionHash) throw new SubmissionConflict("This submission key was already used for a different order.");
      return { id: existing.id, orderNumber: existing.orderNumber };
    }
    // Serialize names per customer; the retry check above must run first.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"order-name:" + userId}, 0))`;
    const normalized = await tx.$queryRaw<{ key: string }[]>`SELECT lower(regexp_replace(trim(${data.orderName}), '[[:space:]]+', ' ', 'g')) AS key`;
    const orderNameKey = normalized[0].key;
    const duplicates = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Order" WHERE "userId" = ${userId} AND lower(regexp_replace(trim("orderName"), '[[:space:]]+', ' ', 'g')) = ${orderNameKey} LIMIT 1`;
    if (duplicates.length) throw new DuplicateOrderName("You already have an order with this name. Choose a new name, for example by adding a date or batch number.");
    const now = new Date();
    const prefix = `SF-${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const counter = await tx.orderCounter.upsert({ where: { month: prefix }, create: { month: prefix, value: 1 }, update: { value: { increment: 1 } } });
    return tx.order.create({
      data: {
        orderNumber: `${prefix}${String(counter.value).padStart(4, "0")}`,
        userId, submissionKey, submissionHash, pricingSnapshot: priceOrder(data), fulfillmentSnapshot: { ...data.fulfillment, pickupLocation: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupLocation : "", pickupInstructions: data.fulfillment.deliveryMethod === "Pickup" ? data.fulfillment.pickupInstructions : "" }, intakeVersion: 4, orderNameKey, orderName: data.orderName,
        priority: data.priority, container: data.container, submissionMode: data.submissionMode,
        poNumber: data.poNumber || null, specialInstructions: data.specialInstructions || null,
        samples: { create: data.samples.map((sample, index) => {
          const { reactions, ...fields } = sample;
          return {
            ...fields,
            tubeLabel: data.container === "Tubes" ? sample.tubeLabel : "",
            plateLabel: data.container === "Plate" ? sample.plateLabel : "",
            well: data.container === "Plate" ? sample.well : "",
            // Compatibility columns only; current screens read Reaction records.
            primerName: reactions[0].primerName, primerSource: reactions[0].primerSource,
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
  }, { maxWait: 10_000, timeout: 20_000 });
}
