import { AdminDropboxes } from "@/components/admin-dropboxes";
import { listDropboxes } from "@/lib/dropbox-store";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export default async function AdminDropboxesPage() {
  await requireAdmin();
  const locations = await listDropboxes(prisma, true);
  return <div className="space-y-7"><div><p className="eyebrow">Sample logistics</p><h1 className="mt-2 text-3xl font-bold">Dropbox locations</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Manage the locations customers can choose for new orders. Keep the address, exact placement, collection schedule and building access up to date. Existing orders retain their saved drop-off details.</p></div><AdminDropboxes initial={locations} /></div>;
}
