import { Mail, Phone, University, UsersRound } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export default async function AccountPage() {
  const session = await requireCustomer();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const details = [
    { label: "Email", value: user.email, icon: Mail },
    { label: "Organization", value: user.organization, icon: University },
    { label: "Laboratory", value: user.labName, icon: UsersRound },
    { label: "Phone", value: user.phone || "Not provided", icon: Phone },
  ];

  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Customer profile</h1>
      <p className="mt-2 text-sm text-slate-500">The contact and laboratory information associated with your orders.</p>
      <section className="panel mt-8">
        <div className="panel-heading"><div><h2 className="text-lg font-bold text-slate-950">{user.firstName} {user.lastName}</h2><p className="mt-1 text-sm text-slate-500">Customer account</p></div></div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
          {details.map(({ label, value, icon: Icon }) => <div key={label} className="bg-white p-5"><Icon className="h-4 w-4 text-cyan-700" /><p className="mt-4 text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>)}
        </div>
      </section>
    </div>
  );
}
