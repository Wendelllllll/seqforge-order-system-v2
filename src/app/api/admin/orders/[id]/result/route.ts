import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resultStorageDirectory } from "@/lib/result-storage";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";
import { lockOrder, OrderStatusError } from "@/lib/order-status";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext<"/api/admin/orders/[id]/result">) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const { id } = await context.params;
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true, status: true, service: true } });
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.service === "OLIGO") return Response.json({ error: "This oligo request is awaiting a quote and customer approval. Result upload cannot complete a quote-pending order." }, { status: 409 });
  if (order.status === "COMPLETED") return Response.json({ error: "Move this order back to QC before replacing its published result." }, { status: 409 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Choose a result file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return Response.json({ error: "Result files must be 25 MB or smaller." }, { status: 400 });
  }

  const safeOriginalName = file.name.replace(/[\r\n"]/g, "_").slice(0, 180) || "result-file";
  const extension = path.extname(safeOriginalName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
  const storedName = `${randomUUID()}${extension}`;
  const storageDirectory = resultStorageDirectory();
  await mkdir(storageDirectory, { recursive: true });
  const storedPath = path.join(storageDirectory, storedName);
  try {
    await writeFile(storedPath, new Uint8Array(await file.arrayBuffer()));
    await prisma.$transaction(async tx => {
      await lockOrder(tx, id);
      const current = await tx.order.findUniqueOrThrow({ where: { id }, select: { status: true } });
      if (current.status === "COMPLETED") throw new OrderStatusError("Move this order back to QC before replacing its published result.", 409);
      await tx.order.update({
        where: { id },
        data: {
          // A staff member must review this file before completing; any earlier
          // completion form becomes stale when the result changes.
          statusRevision: { increment: 1 },
          result: {
            upsert: {
              create: {
                originalName: safeOriginalName,
                storedName,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
              },
              update: {
                originalName: safeOriginalName,
                storedName,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
                uploadedAt: new Date(),
              },
            },
          },
        },
      });
    });
  } catch (error) {
    // Only the new, randomly named file belongs to this failed upload.
    await unlink(storedPath).catch(() => undefined);
    if (error instanceof OrderStatusError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Result upload could not be saved.");
    return Response.json({ error: "Unable to save the result file. Please try again." }, { status: 503 });
  }

  return Response.json({ success: true });
}
