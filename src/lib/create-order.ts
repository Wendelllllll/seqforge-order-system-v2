import type { PrismaClient } from "@prisma/client";
import type { OrderDraft } from "./order-intake";

export async function createOrder(db: PrismaClient, userId: string, data: OrderDraft) {
  // Allocate the number and insert the complete order in one SQLite write transaction.
  return db.$transaction(async (tx) => {
    const now = new Date();
    const prefix = `SF-${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const previous = await tx.order.findMany({ where: { orderNumber: { startsWith: prefix } }, select: { orderNumber: true } });
    const last = previous.reduce((max, order) => {
      const suffix = order.orderNumber.slice(prefix.length);
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, 0);
    return tx.order.create({
      data: {
        orderNumber: `${prefix}${String(last + 1).padStart(4, "0")}`,
        userId, intakeVersion: 2, orderName: data.orderName,
        priority: data.priority, container: data.container, submissionMode: data.submissionMode,
        poNumber: data.poNumber || null, specialInstructions: data.specialInstructions || null,
        samples: { create: data.samples.map((sample, index) => {
          const { reactions, ...fields } = sample;
          return {
            ...fields,
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
  });
}
