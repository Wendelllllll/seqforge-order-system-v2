import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const sampleSchema = z.object({
  sampleName: z.string().trim().min(1, "Every sample needs a name.").max(100),
  templateType: z.string().trim().min(1).max(100),
  concentration: z.string().trim().max(60),
  primerName: z.string().trim().min(1, "Every sample needs a primer.").max(100),
  primerSource: z.string().trim().min(1).max(100),
  notes: z.string().trim().max(500),
});

const orderSchema = z.object({
  orderName: z.string().trim().min(1, "Order name is required.").max(120),
  poNumber: z.string().trim().max(80),
  specialInstructions: z.string().trim().max(2000),
  samples: z.array(sampleSchema).min(1, "Add at least one sample.").max(200),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || session.user.role === "admin") {
    return Response.json({ error: "You must be signed in as a customer." }, { status: 401 });
  }

  const parsed = orderSchema.safeParse(await request.json());

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message || "Check the order details and try again." },
      { status: 400 },
    );
  }

  const now = new Date();
  const prefix = `SF-${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const latest = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const nextSequence = latest ? Number(latest.orderNumber.slice(-4)) + 1 : 1;
  const orderNumber = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  const data = parsed.data;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      userId: session.user.id,
      orderName: data.orderName,
      poNumber: data.poNumber || null,
      specialInstructions: data.specialInstructions || null,
      status: "SUBMITTED",
      samples: {
        create: data.samples.map((sample, index) => ({
          position: index + 1,
          sampleName: sample.sampleName,
          templateType: sample.templateType,
          concentration: sample.concentration || null,
          primerName: sample.primerName,
          primerSource: sample.primerSource,
          notes: sample.notes || null,
        })),
      },
      statusHistory: {
        create: { status: "SUBMITTED" },
      },
    },
    select: { id: true, orderNumber: true },
  });

  return Response.json(order, { status: 201 });
}
