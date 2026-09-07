import { CheckCircle2, Download, FileText, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatDateTime, ORDER_STATUSES, STATUS_LABELS } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { requireCustomer } from "@/lib/session";

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  const session = await requireCustomer();
  const { id } = await params;
  const query = await searchParams;
  const order = await prisma.order.findFirst({
    where: { id, userId: session.user.id },
    include: {
      samples: { orderBy: { position: "asc" } },
      result: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) notFound();

  const currentIndex = ORDER_STATUSES.indexOf(order.status as (typeof ORDER_STATUSES)[number]);

  return (
    <div className="mx-auto max-w-6xl">
      {query.submitted === "1" ? (
        <div className="mb-6 flex gap-3 border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-bold">Order submitted successfully</p><p className="mt-1 text-sm text-emerald-700">SeqForge has received {order.samples.length} {order.samples.length === 1 ? "sample" : "samples"} under order {order.orderNumber}.</p></div>
        </div>
      ) : null}

      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3"><p className="eyebrow">Sanger sequencing order</p><StatusBadge status={order.status} /></div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{order.orderName}</h1>
          <p className="mt-2 font-mono text-sm font-bold text-slate-500">{order.orderNumber}</p>
        </div>
        <PrintButton />
      </div>

      <section className="panel mt-8 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-6">
          {ORDER_STATUSES.map((status, index) => {
            const complete = index <= currentIndex;
            return (
              <div key={status} className="relative">
                <div className={`mb-2 h-1 ${complete ? "bg-cyan-600" : "bg-slate-200"}`} />
                <p className={`text-xs font-bold ${complete ? "text-slate-900" : "text-slate-400"}`}>{STATUS_LABELS[status]}</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="panel">
            <div className="panel-heading"><h2 className="text-lg font-bold text-slate-950">Samples and primers</h2><span className="metric-pill">{order.samples.length} reactions</span></div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[800px]">
                <thead><tr><th>#</th><th>Sample</th><th>Template</th><th>Concentration</th><th>Primer</th><th>Source</th><th>Notes</th></tr></thead>
                <tbody>{order.samples.map((sample) => <tr key={sample.id}><td>{sample.position}</td><td className="font-semibold text-slate-900">{sample.sampleName}</td><td>{sample.templateType}</td><td>{sample.concentration || "—"}</td><td className="font-semibold">{sample.primerName}</td><td>{sample.primerSource}</td><td>{sample.notes || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-950">Instructions</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{order.specialInstructions || "No special instructions were provided."}</p>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-bold text-slate-950">Order details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <Detail label="Service" value="Sanger DNA sequencing" />
              <Detail label="Submitted" value={formatDateTime(order.createdAt)} />
              <Detail label="PO number" value={order.poNumber || "Not provided"} />
              <Detail label="Samples" value={String(order.samples.length)} />
            </dl>
          </section>

          <section className={`border p-5 ${order.result ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-3"><FlaskConical className={`h-5 w-5 ${order.result ? "text-emerald-700" : "text-slate-400"}`} /><h2 className="text-sm font-bold text-slate-950">Sequencing result</h2></div>
            {order.result ? (
              <div className="mt-4">
                <div className="flex items-start gap-3"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.result.originalName}</p><p className="mt-1 text-xs text-slate-500">Uploaded {formatDate(order.result.uploadedAt)}</p></div></div>
                <Link href={`/api/results/${order.result.id}`} className="button-primary mt-4 w-full justify-center bg-emerald-700 hover:bg-emerald-800"><Download className="h-4 w-4" /> Download result</Link>
              </div>
            ) : <p className="mt-3 text-sm leading-6 text-slate-500">A download will appear here after SeqForge completes processing and uploads your result.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 font-medium text-slate-700">{value}</dd></div>;
}
