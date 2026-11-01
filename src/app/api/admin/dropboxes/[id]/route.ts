import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DropboxChanged, updateDropbox } from "@/lib/dropbox-store";
import { dropboxUpdateSchema } from "@/lib/dropboxes";
import { hasTrustedRequestOrigin } from "@/lib/request-origin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403 });
  if (!hasTrustedRequestOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 16000) return Response.json({ error: "Request too large." }, { status: 413 });
    const parsed = dropboxUpdateSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return Response.json({ error: "Check the location fields and map coordinates.", issues: parsed.error.issues.map(issue => issue.message) }, { status: 400 });
    const { id } = await context.params;
    return Response.json({ location: await updateDropbox(prisma, id, parsed.data, parsed.data.expectedRevision) });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Send valid JSON." }, { status: 400 });
    if (error instanceof DropboxChanged) return Response.json({ error: "This location changed or no longer exists. Reload the list before editing." }, { status: 409 });
    console.error("Dropbox update failed", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Unable to save this location. Try again." }, { status: 503 });
  }
}
