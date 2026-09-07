import { ArrowRight, Beaker, CheckCircle2, Clock3, Plus } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireCustomer();
  const [orders, totalOrders, activeOrders, completedOrders] = await Promise.all([
    prisma.order.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { samples: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.order.count({ where: { userId: session.user.id } }),
    prisma.order.count({ where: { userId: session.user.id, status: { not: "COMPLETED" } } }),
    prisma.order.count({ where: { userId: session.user.id, status: "COMPLETED" } }),
  ]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Customer dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Good day, {session.user.firstName}.</h1>
          <p className="mt-2 text-sm text-slate-500">{session.user.organization} · {session.user.labName}</p>
        </div>
        <Link href="/orders/new" className="button-primary justify-center"><Plus className="h-4 w-4" /> New Sanger order</Link>
      </div>

      <div className="mt-8 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-3">
        {[
          { label: "All orders", value: totalOrders, icon: Beaker, detail: "Submitted to SeqForge" },
          { label: "In progress", value: activeOrders, icon: Clock3, detail: "Active laboratory work" },
          { label: "Completed", value: completedOrders, icon: CheckCircle2, detail: "Results available" },
        ].map(({ label, value, icon: Icon, detail }) => (
          <div key={label} className="bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
              </div>
              <Icon className="h-5 w-5 text-cyan-700" />
            </div>
            <p className="mt-3 text-xs text-slate-400">{detail}</p>
          </div>
        ))}
      </div>

      <section className="panel mt-8">
        <div className="panel-heading items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Recent orders</h2>
            <p className="mt-1 text-sm text-slate-500">Your latest sequencing submissions and status updates.</p>
          </div>
          <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 hover:text-cyan-900">View all <ArrowRight className="h-4 w-4" /></Link>
        </div>

        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead><tr><th>Order number</th><th>Order name</th><th>Service</th><th>Submitted</th><th>Samples</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="font-mono text-xs font-bold text-slate-900">{order.orderNumber}</td>
                    <td className="font-semibold text-slate-900">{order.orderName}</td>
                    <td>Sanger</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{order._count.samples}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td><Link href={`/orders/${order.id}`} className="font-bold text-cyan-700 hover:text-cyan-900">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 text-center">
            <Beaker className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="mt-4 font-bold text-slate-900">No sequencing orders yet</h3>
            <p className="mt-2 text-sm text-slate-500">Start with one or more Sanger sequencing samples.</p>
            <Link href="/orders/new" className="button-primary mt-5"><Plus className="h-4 w-4" /> Create first order</Link>
          </div>
        )}
      </section>
    </div>
  );
}
