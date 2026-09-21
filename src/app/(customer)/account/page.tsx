import { AccountProfileForm } from "@/components/account-profile-form";

import { AccountDefaultsForm } from "@/components/account-defaults-form";
import { readDefaults } from "@/lib/order-defaults";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export default async function AccountPage() {
  const session = await requireCustomer();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });


  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Customer profile</h1>
      <p className="mt-2 text-sm text-slate-500">The contact and laboratory information associated with your orders.</p>
      <AccountProfileForm email={user.email} initial={{ firstName: user.firstName, lastName: user.lastName, organization: user.organization, labName: user.labName, phone: user.phone || "" }} />
      <AccountDefaultsForm initial={user.orderDefaults ? readDefaults(user.orderDefaults) : { ...readDefaults(null), contactName: user.name, contactPhone: user.phone || "", billingOrganization: user.organization }} />
    </div>
  );
}
