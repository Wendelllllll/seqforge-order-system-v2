import Link from "next/link";
import { AdminOrders } from "@/components/admin-orders";
import type { OrderQuery } from "@/lib/admin-order-filters";
import { Beaker, CheckCircle2, Clock3, FlaskConical, UsersRound } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<OrderQuery> }) {
  await requireAdmin();
  const [totalOrders, newOrders, activeOrders, completedOrders, customerCount] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: "SUBMITTED" } }),
    prisma.order.count({ where: { status: { notIn: ["SUBMITTED", "COMPLETED"] } } }),
    prisma.order.count({ where: { status: "COMPLETED" } }),
    prisma.user.count({ where: { role: "customer" } }),
  ]);

  return (
    <div>
      <div>
        <p className="eyebrow">Operations dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Sequencing order queue</h1>
        <p className="mt-2 text-sm text-slate-500">Monitor new submissions, laboratory status, and result delivery.</p>
      </div>

      <div className="mt-8 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total orders", value: totalOrders, icon: Beaker },
          { label: "New", value: newOrders, icon: FlaskConical },
          { label: "In progress", value: activeOrders, icon: Clock3 },
          { label: "Completed", value: completedOrders, icon: CheckCircle2 },
          { label: "Customers", value: customerCount, icon: UsersRound },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white p-5">
            <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p><Icon className="h-4 w-4 text-cyan-700" /></div>
            <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <AdminOrders query={await searchParams} base="/admin" />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section id="customers" className="panel scroll-mt-8 p-5 sm:p-6"><UsersRound className="h-5 w-5 text-cyan-700" /><h2 className="mt-4 text-lg font-bold text-slate-950">Customer accounts</h2><p className="mt-2 text-sm leading-6 text-slate-500">{customerCount} customer {customerCount === 1 ? "account is" : "accounts are"} registered.</p><Link className="button-secondary mt-4" href="/admin/customers">Browse customers</Link></section>
        <section id="results" className="panel scroll-mt-8 p-5 sm:p-6"><FlaskConical className="h-5 w-5 text-cyan-700" /><h2 className="mt-4 text-lg font-bold text-slate-950">Result delivery</h2><p className="mt-2 text-sm leading-6 text-slate-500">{completedOrders} completed {completedOrders === 1 ? "order has" : "orders have"} customer-visible result status.</p></section>
      </div>
    </div>
  );
}
