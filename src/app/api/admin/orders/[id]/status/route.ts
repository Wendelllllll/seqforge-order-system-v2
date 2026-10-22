import { z } from "zod";

import { auth } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { isOligoProductionBlocked } from "@/lib/oligo-schema";

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export async function PATCH(request: Request, context: RouteContext<"/api/admin/orders/[id]/status">) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Select a valid order status." }, { status: 400 });
  }

  const { id } = await context.params;
  const existing = await prisma.order.findUnique({ where: { id }, select: { status: true, service: true } });
  if (!existing) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const status = parsed.data.status;
  if (isOligoProductionBlocked(existing.service, status)) return Response.json({ error: "This oligo request is awaiting a quote and customer approval. Production and completion are unavailable until an approved quote can be recorded." }, { status: 409 });
  await prisma.order.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
      ...(status !== existing.status
        ? { statusHistory: { create: { status } } }
        : {}),
    },
  });

  return Response.json({ status });
}
