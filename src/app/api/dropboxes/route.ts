import { listDropboxes } from "@/lib/dropbox-store";
import { prisma } from "@/lib/prisma";

export async function GET() {
  return Response.json({ locations: await listDropboxes(prisma) }, { headers: { "Cache-Control": "no-store" } });
}
