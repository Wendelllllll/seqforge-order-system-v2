import { z } from "zod";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { ORDER_STATUSES } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { safeDispatchCustomerNotifications } from "@/lib/customer-notifications";
import { OrderStatusError, setOrderStatus } from "@/lib/order-status";

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(1000).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export async function PATCH(request: Request, context: RouteContext<"/api/admin/orders/[id]/status">) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Select a valid order status." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const result = await setOrderStatus(prisma, id, parsed.data.status, {
      reason: parsed.data.reason,
      expectedRevision: parsed.data.expectedRevision,
      requestKey: request.headers.get("Idempotency-Key") || undefined,
      actor: { id: session.user.id, name: session.user.name },
    });
    if (result.changed) after(() => safeDispatchCustomerNotifications(prisma));
    return Response.json({ status: result.status, revision: result.revision });
  } catch (error) {
    if (error instanceof OrderStatusError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Order status update failed.");
    return Response.json({ error: "Unable to update the order status. Please try again." }, { status: 503 });
  }
}
