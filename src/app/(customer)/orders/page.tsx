import { Beaker, Plus } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export default async function OrdersPage() {
  const session = await requireCustomer();
  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    include: { samples: { select: { _count: { select: { reactions: true } } } }, result: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Order history</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Your sequencing orders</h1>
          <p className="mt-2 text-sm text-slate-500">Review submitted samples, current status, and available results.</p>
        </div>
        <Link href="/orders/new" className="button-primary justify-center"><Plus className="h-4 w-4" /> New Sanger order</Link>
      </div>

      <section className="panel mt-8">
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[820px]">
              <thead><tr><th>Order number</th><th>Name</th><th>Service</th><th>Date</th><th>Samples / reactions</th><th>Status</th><th>Result</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="font-mono text-xs font-bold text-slate-900">{order.orderNumber}</td>
                    <td className="font-semibold text-slate-900">{order.orderName}</td>
                    <td>Sanger{order.intakeVersion >= 2 ? <p className="mt-1 text-xs text-slate-500">{order.priority} · {order.container} · {order.submissionMode}</p> : null}</td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>{order.samples.length} / {order.samples.reduce((sum, sample) => sum + sample._count.reactions, 0)}</td>
                    <td><StatusBadge status={order.status} /></td>
                    <td>{order.result ? <span className="font-semibold text-emerald-700">Available</span> : <span className="text-slate-400">—</span>}</td>
                    <td><Link href={`/orders/${order.id}`} className="font-bold text-cyan-700 hover:text-cyan-900">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <Beaker className="mx-auto h-8 w-8 text-slate-300" />
            <h2 className="mt-4 font-bold text-slate-900">Your order history is empty</h2>
            <p className="mt-2 text-sm text-slate-500">Submitted orders will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
