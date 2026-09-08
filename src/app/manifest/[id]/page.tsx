import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { OrderManifest } from "@/components/order-manifest";
import { PrintButton } from "@/components/print-button";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatDateTime } from "@/lib/orders";

export default async function ManifestPage({ params }: PageProps<"/manifest/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: { id, ...(session.user.role === "admin" ? {} : { userId: session.user.id }) },
    include: { user: { select: { name: true, organization: true, labName: true } }, samples: { orderBy: { position: "asc" }, include: { reactions: { orderBy: { position: "asc" } } } } },
  });
  if (!order) notFound();
  return <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
    <div className="print-hide flex flex-wrap justify-between gap-3"><Link className="button-secondary" href={session.user.role === "admin" ? `/admin/orders/${id}` : `/orders/${id}`}>Back to order</Link><PrintButton /></div>
    <Brand />
    <div className="text-sm"><p className="font-bold">{order.user.name} · {order.user.organization} · {order.user.labName}</p><p className="mt-1">Submitted {formatDateTime(order.createdAt)}</p></div>
    <OrderManifest order={order} />
    <p className="text-xs text-slate-500">Demo submission document. Coordinate sample delivery and acceptance with SeqForge before shipping.</p>
  </main>;
}
