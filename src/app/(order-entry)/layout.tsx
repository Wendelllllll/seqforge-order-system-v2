import { PortalShell } from "@/components/portal-shell";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function OrderEntryLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.user.role === "admin") redirect("/admin");
  return <PortalShell user={session?.user || null} role="customer">{children}</PortalShell>;
}
