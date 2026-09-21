import { auth } from "@/lib/auth";
import { orderDefaultsSchema } from "@/lib/order-defaults";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role === "admin") return Response.json({ error: "Sign in as a customer." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16_000) return Response.json({ error: "Account details are too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Send valid account details." }, { status: 400 }); }
  const parsed = orderDefaultsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" ") }, { status: 400 });
  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { orderDefaults: parsed.data } });
    return Response.json({ saved: true });
  } catch {
    return Response.json({ error: "Unable to save your defaults. Please try again." }, { status: 503 });
  }
}
