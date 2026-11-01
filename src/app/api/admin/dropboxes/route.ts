import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDropbox, listDropboxes } from "@/lib/dropbox-store";
import { dropboxInputSchema } from "@/lib/dropboxes";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  return Response.json({ locations: await listDropboxes(prisma, true) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16000) return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = dropboxInputSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: "Check the location fields and map coordinates.", issues: parsed.error.issues.map(issue => issue.message) }, { status: 400 });
    return Response.json({ location: await createDropbox(prisma, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Send valid JSON." }, { status: 400 });
    console.error("Dropbox create failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save this location. Try again." }, { status: 503 });
  }
}
