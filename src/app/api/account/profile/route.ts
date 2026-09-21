import { auth } from "@/lib/auth";
import { accountProfileSchema } from "@/lib/account-profile";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || session.user.role !== "customer") return Response.json({ error: "Sign in as a customer." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 8_000) return Response.json({ error: "Profile is too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch { return Response.json({ error: "Send valid profile details." }, { status: 400 }); }
  const parsed = accountProfileSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  try {
    await prisma.user.update({ where: { id: session.user.id }, data: { ...parsed.data, name: `${parsed.data.firstName} ${parsed.data.lastName}` } });
    return Response.json({ saved: true, profile: parsed.data });
  } catch { return Response.json({ error: "Unable to save your profile. Please try again." }, { status: 503 }); }
}
