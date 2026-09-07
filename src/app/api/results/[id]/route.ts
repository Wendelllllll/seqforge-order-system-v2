import { readFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: RouteContext<"/api/results/[id]">) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Sign in to download this result." }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await prisma.result.findUnique({
    where: { id },
    include: { order: { select: { userId: true } } },
  });

  if (!result) {
    return Response.json({ error: "Result not found." }, { status: 404 });
  }
  if (session.user.role !== "admin" && result.order.userId !== session.user.id) {
    return Response.json({ error: "You do not have access to this result." }, { status: 403 });
  }

  try {
    const file = await readFile(path.join(process.cwd(), "storage", "results", result.storedName));
    const safeDownloadName = result.originalName.replace(/[\r\n"]/g, "_");
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": result.mimeType,
        "Content-Length": String(result.size),
        "Content-Disposition": `attachment; filename="${safeDownloadName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "The result file is unavailable." }, { status: 404 });
  }
}
