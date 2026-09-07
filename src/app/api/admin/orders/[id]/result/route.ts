import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext<"/api/admin/orders/[id]/result">) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role !== "admin") {
    return Response.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const { id } = await context.params;
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

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
  const storageDirectory = path.join(process.cwd(), "storage", "results");
  await mkdir(storageDirectory, { recursive: true });
  await writeFile(path.join(storageDirectory, storedName), new Uint8Array(await file.arrayBuffer()));

  await prisma.order.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
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
      ...(order.status !== "COMPLETED"
        ? { statusHistory: { create: { status: "COMPLETED" } } }
        : {}),
    },
  });

  return Response.json({ success: true });
}
