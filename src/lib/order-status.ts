import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { enqueueOrderAttention, enqueueResultReady } from "./customer-notifications";
import { isOligoProductionBlocked } from "./oligo-schema";
import { isOrderStatus, type OrderStatus } from "./orders";

export class OrderStatusError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Uploads take the same row lock, so a result cannot be replaced while it is
// being released and concurrent status requests observe the committed status.
export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new OrderStatusError("Order not found.", 404);
}

type StatusOptions = {
  reason?: string;
  expectedRevision?: number;
  requestKey?: string;
  actor?: { id: string; name: string };
};

export async function setOrderStatus(db: PrismaClient, id: string, status: OrderStatus, options: StatusOptions = {}) {
  const reason = options.reason?.trim() || "";
  if (!isOrderStatus(status) || reason.length > 1000) throw new OrderStatusError("Check the status and customer message.", 400);
  if (options.expectedRevision !== undefined && (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 0)) {
    throw new OrderStatusError("Reload the order before changing its status.", 400);
  }
  if (options.requestKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.requestKey)) {
    throw new OrderStatusError("Reload the order before changing its status.", 400);
  }
  const requestHash = createHash("sha256").update(JSON.stringify({ status, reason, expectedRevision: options.expectedRevision ?? null })).digest("hex");
  return db.$transaction(async tx => {
    await lockOrder(tx, id);
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { result: { select: { id: true } }, user: { select: { id: true, email: true } } },
    });
    if (options.requestKey) {
      const previous = await tx.statusHistory.findUnique({ where: { orderId_requestKey: { orderId: id, requestKey: options.requestKey } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new OrderStatusError("This update was already used with different details. Reload the order and try again.", 409);
        return { status: order.status, changed: false, revision: order.statusRevision };
      }
    }
    const holdAction = status === "ON_HOLD" || order.status === "ON_HOLD";
    if (holdAction && (!reason || options.expectedRevision === undefined || !options.requestKey || !options.actor)) {
      throw new OrderStatusError("Provide a customer message and next steps, then reload the order if needed before updating the hold.", 400);
    }
    if (options.expectedRevision !== undefined && options.expectedRevision !== order.statusRevision) {
      throw new OrderStatusError("Another staff member updated this order. Reload it and review the latest status before saving.", 409);
    }
    if (isOligoProductionBlocked(order.service, status)) {
      throw new OrderStatusError("This oligo request is awaiting a quote and customer approval. Production and completion are unavailable until an approved quote can be recorded.", 409);
    }
    if (order.status === "ON_HOLD" && status === "COMPLETED") {
      throw new OrderStatusError("Resolve the hold and return to a working status before completing the order.", 409);
    }
    // A repeated request does not backfill notifications for historical orders.
    if (order.status === status && (status !== "ON_HOLD" || reason === order.holdReason)) return { status, changed: false, revision: order.statusRevision };
    if (status === "COMPLETED" && !order.result) {
      throw new OrderStatusError("Upload and check the result file before completing this order.", 409);
    }
    const safePreviousStatus = order.status === "COMPLETED" ? "QC" : order.status;
    await tx.order.update({
      where: { id },
      data: {
        status, completedAt: status === "COMPLETED" ? new Date() : null,
        statusRevision: { increment: 1 },
        holdReason: status === "ON_HOLD" ? reason : null,
        holdPreviousStatus: status === "ON_HOLD" ? order.holdPreviousStatus || safePreviousStatus : null,
      },
    });
    const history = await tx.statusHistory.create({ data: {
      orderId: id, status, previousStatus: order.status, note: holdAction ? reason : null,
      actorId: options.actor?.id, actorName: options.actor?.name,
      requestKey: options.requestKey, requestHash: options.requestKey ? requestHash : null,
    } });
    if (status === "COMPLETED") await enqueueResultReady(tx, order);
    if (holdAction) await enqueueOrderAttention(tx, order, { historyId: history.id, reason, resumed: status !== "ON_HOLD" });
    return { status, changed: true, revision: order.statusRevision + 1 };
  });
}
