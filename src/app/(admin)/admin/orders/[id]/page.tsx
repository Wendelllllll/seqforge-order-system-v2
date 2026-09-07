import { ArrowLeft, Download, FileText, Mail, Phone, University, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResultUpload, StatusControl } from "@/components/admin-order-actions";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: true,
      samples: { orderBy: { position: "asc" } },
      result: true,
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-cyan-700"><ArrowLeft className="h-4 w-4" /> Back to order queue</Link>
      <div className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Manage order</p><StatusBadge status={order.status} /></div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{order.orderName}</h1>
          <p className="mt-2 font-mono text-sm font-bold text-slate-500">{order.orderNumber}</p>
        </div>
        <p className="text-sm text-slate-500">Submitted {formatDateTime(order.createdAt)}</p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="panel">
            <div className="panel-heading"><div><h2 className="text-lg font-bold text-slate-950">Samples and primers</h2><p className="mt-1 text-sm text-slate-500">Review the submitted sequencing reactions.</p></div><span className="metric-pill">{order.samples.length} reactions</span></div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[900px]">
                <thead><tr><th>#</th><th>Sample</th><th>Template</th><th>Concentration</th><th>Primer</th><th>Source</th><th>Notes</th></tr></thead>
                <tbody>{order.samples.map((sample) => <tr key={sample.id}><td>{sample.position}</td><td className="font-semibold text-slate-900">{sample.sampleName}</td><td>{sample.templateType}</td><td>{sample.concentration || "—"}</td><td className="font-semibold">{sample.primerName}</td><td>{sample.primerSource}</td><td>{sample.notes || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="panel p-5 sm:p-6"><h2 className="text-lg font-bold text-slate-950">Special instructions</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{order.specialInstructions || "No special instructions were provided."}</p></section>

          <section className="panel p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-950">Customer information</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <Info icon={UsersRound} label="Customer" value={order.user.name} />
              <Info icon={Mail} label="Email" value={order.user.email} />
              <Info icon={University} label="Organization" value={order.user.organization} />
              <Info icon={UsersRound} label="Laboratory" value={order.user.labName} />
              <Info icon={Phone} label="Phone" value={order.user.phone || "Not provided"} />
              <Info icon={FileText} label="PO number" value={order.poNumber || "Not provided"} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5"><h2 className="mb-4 text-sm font-bold text-slate-950">Update laboratory status</h2><StatusControl key={order.status} orderId={order.id} currentStatus={order.status} /></section>
          <section className="panel p-5"><h2 className="mb-4 text-sm font-bold text-slate-950">Result file</h2><ResultUpload orderId={order.id} existingName={order.result?.originalName} />{order.result ? <Link href={`/api/results/${order.result.id}`} className="button-secondary mt-3 w-full justify-center"><Download className="h-4 w-4" /> Download current file</Link> : null}</section>
          <section className="panel p-5">
            <h2 className="text-sm font-bold text-slate-950">Status history</h2>
            <ol className="mt-4 space-y-4">{order.statusHistory.map((entry) => <li key={entry.id} className="border-l-2 border-cyan-600 pl-3"><p className="text-sm font-semibold capitalize text-slate-800">{entry.status.toLowerCase()}</p><p className="mt-1 text-xs text-slate-400">{formatDateTime(entry.createdAt)}</p></li>)}</ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return <div className="flex gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" /><div><p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div></div>;
}
