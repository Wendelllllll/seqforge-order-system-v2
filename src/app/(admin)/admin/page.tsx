import { Beaker, CheckCircle2, Clock3, FlaskConical, UsersRound } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [orders, totalOrders, newOrders, activeOrders, completedOrders, customerCount] = await Promise.all([
    prisma.order.findMany({
      include: {
        user: { select: { name: true, organization: true, labName: true } },
        samples: { select: { _count: { select: { reactions: true } } } },
        result: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
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

      <section id="orders" className="panel mt-8 scroll-mt-8">
        <div className="panel-heading">
          <div><h2 className="text-lg font-bold text-slate-950">All orders</h2><p className="mt-1 text-sm text-slate-500">Newest submissions appear first.</p></div>
          <span className="metric-pill">{orders.length} total</span>
        </div>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1050px]">
              <thead><tr><th>Order</th><th>Customer</th><th>Organization / lab</th><th>Service</th><th>Samples / reactions</th><th>Submitted</th><th>Status</th><th>Result</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td><p className="font-mono text-xs font-bold text-slate-900">{order.orderNumber}</p><p className="mt-1 max-w-44 truncate text-xs text-slate-500">{order.orderName}</p></td>
                    <td className="font-semibold text-slate-900">{order.user.name}</td>
                    <td><p className="font-medium text-slate-700">{order.user.organization}</p><p className="mt-1 text-xs text-slate-400">{order.user.labName}</p></td>
                    <td>Sanger{order.intakeVersion >= 2 ? <p className="mt-1 text-xs text-slate-500">{order.priority} · {order.container} · {order.submissionMode}</p> : null}</td>
                    <td>{order.samples.length} / {order.samples.reduce((sum, sample) => sum + sample._count.reactions, 0)}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td>{order.result ? <span className="font-semibold text-emerald-700">Uploaded</span> : <span className="text-slate-400">Pending</span>}</td>
                    <td><Link href={`/admin/orders/${order.id}`} className="font-bold text-cyan-700 hover:text-cyan-900">Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center"><Beaker className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-4 font-bold text-slate-900">No orders in the queue</h3><p className="mt-2 text-sm text-slate-500">Customer submissions will appear here immediately.</p></div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section id="customers" className="panel scroll-mt-8 p-5 sm:p-6"><UsersRound className="h-5 w-5 text-cyan-700" /><h2 className="mt-4 text-lg font-bold text-slate-950">Customer accounts</h2><p className="mt-2 text-sm leading-6 text-slate-500">{customerCount} customer {customerCount === 1 ? "account is" : "accounts are"} registered in this local demo.</p></section>
        <section id="results" className="panel scroll-mt-8 p-5 sm:p-6"><FlaskConical className="h-5 w-5 text-cyan-700" /><h2 className="mt-4 text-lg font-bold text-slate-950">Result delivery</h2><p className="mt-2 text-sm leading-6 text-slate-500">{completedOrders} completed {completedOrders === 1 ? "order has" : "orders have"} customer-visible result status.</p></section>
      </div>
    </div>
  );
}
