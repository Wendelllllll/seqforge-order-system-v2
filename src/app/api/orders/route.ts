import { auth } from "@/lib/auth";
import { createOrder, SubmissionConflict } from "@/lib/create-order";
import { issueLabel, orderSchema } from "@/lib/order-intake";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role === "admin") return Response.json({ error: "You must be signed in as a customer." }, { status: 401 });
  const submissionKey = request.headers.get("Idempotency-Key") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionKey)) return Response.json({ error: "Reload the order form to start a valid submission." }, { status: 400 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 2_000_000) return Response.json({ error: "Order data is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Send a valid JSON order." }, { status: 400 }); }
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Check the order details.", issues: parsed.error.issues.map(issueLabel) }, { status: 400 });
  try {
    return Response.json(await createOrder(prisma, session.user.id, parsed.data, submissionKey), { status: 201 });
  } catch (error) {
    if (error instanceof SubmissionConflict) return Response.json({ error: error.message }, { status: 409 });
    console.error("Order creation failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save the order. Your entries are still available; please try again." }, { status: 503 });
  }
}
