import { PortalShell } from "@/components/portal-shell";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdmin();
  return (
    <PortalShell user={session.user} role="admin">
      {children}
    </PortalShell>
  );
}
