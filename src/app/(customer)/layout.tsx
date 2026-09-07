import { PortalShell } from "@/components/portal-shell";
import { requireCustomer } from "@/lib/session";

export default async function CustomerLayout({ children }: LayoutProps<"/">) {
  const session = await requireCustomer();
  return (
    <PortalShell user={session.user} role="customer">
      {children}
    </PortalShell>
  );
}
