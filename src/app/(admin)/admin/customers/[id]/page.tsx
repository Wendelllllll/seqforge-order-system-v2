import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/orders";
import { orderDefaultsSchema } from "@/lib/order-defaults";
import { AdminOrders } from "@/components/admin-orders";
import type { OrderQuery } from "@/lib/admin-order-filters";
import { CustomerPricingEditor } from "@/components/customer-pricing-editor";
import { getCustomerPricing } from "@/lib/customer-pricing-store";
import { customerOverridesSchema } from "@/lib/customer-pricing";
import { getRateSchedule } from "@/lib/pricing-store";
import { ACTIVE_RATE_ITEMS } from "@/lib/rate-schedule";
import { formatMoney } from "@/lib/pricing";

function Detail({ label, children }: { label: string; children?: ReactNode }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-900">{children || <span className="text-slate-400">Not provided</span>}</dd></div>;
}

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<OrderQuery> }) {
  await requireAdmin();
  const { id } = await params;
  const customer = await prisma.user.findFirst({ where: { id, role: "customer" }, select: { id: true, name: true, email: true, phone: true, organization: true, labName: true, createdAt: true, orderDefaults: true } });
  if (!customer) notFound();
  const [statuses, latest, pricing, defaultSchedule, pricingHistory] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: { userId: id }, _count: { _all: true } }),
    prisma.order.findFirst({ where: { userId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, orderNumber: true, createdAt: true } }),
    getCustomerPricing(prisma, id),
    getRateSchedule(prisma),
    prisma.customerPricingChange.findMany({ where: { customerId: id }, orderBy: { revision: "desc" }, take: 20 }),
  ]);
  const total = statuses.reduce((sum, status) => sum + status._count._all, 0);
  const completed = statuses.find(status => status.status === "COMPLETED")?._count._all || 0;
  const defaults = orderDefaultsSchema.safeParse(customer.orderDefaults);
  return <div className="space-y-7">
    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-800" href="/admin/customers"><ArrowLeft size={16} />All customers</Link>
    <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow">Customer profile</p><h1 className="mt-2 text-3xl font-bold">{customer.name}</h1><p className="mt-3 text-sm text-slate-500">{customer.organization || "Organization not provided"} · Joined {formatDate(customer.createdAt)}</p></div><a href={`mailto:${customer.email}`} className="button-secondary"><Mail size={16} />Email customer</a></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{ label: "Submitted orders", value: total }, { label: "Open orders", value: total - completed }, { label: "Completed", value: completed }, { label: "Latest order", value: latest ? formatDate(latest.createdAt) : "No orders yet" }].map(item => <div className="panel p-5" key={item.label}><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p><p className="mt-3 text-2xl font-bold">{item.value}</p></div>)}</div>
    <section className="panel p-5 sm:p-6"><h2 className="text-lg font-bold">Account & contact</h2><dl className="mt-5 grid gap-6 sm:grid-cols-2 xl:grid-cols-4"><Detail label="Name">{customer.name}</Detail><Detail label="Email"><a className="text-cyan-800" href={`mailto:${customer.email}`}>{customer.email}</a></Detail><Detail label="Phone">{customer.phone ? <span className="inline-flex items-center gap-2"><Phone size={14} />{customer.phone}</span> : null}</Detail><Detail label="Organization">{customer.organization}</Detail><Detail label="Lab / group">{customer.labName}</Detail><Detail label="Registered">{formatDate(customer.createdAt)}</Detail></dl></section>
    <CustomerPricingEditor key={customer.id} initial={pricing} defaultSchedule={defaultSchedule} customerName={customer.name} />
    <details className="panel p-5 sm:p-6"><summary className="cursor-pointer text-lg font-bold">Customer price change history <span className="text-sm font-normal text-slate-500">· Latest 20 revisions</span></summary>
      {pricingHistory.length ? <ul className="mt-5 divide-y divide-slate-200">{pricingHistory.map(change => {
        const before = customerOverridesSchema.safeParse(change.previousOverrides);
        const after = customerOverridesSchema.safeParse(change.overrides);
        const description = (value: number | undefined) => value === undefined ? "Use default rate" : `${formatMoney(value)} custom`;
        return <li key={change.id} className="space-y-3 py-4 first:pt-0"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">Revision {change.revision} · {change.actorName}</strong><time className="text-sm text-slate-500" dateTime={change.createdAt.toISOString()}>{formatDateTime(change.createdAt)}</time></div><p className="whitespace-pre-wrap text-sm">{change.reason}</p>{before.success && after.success ? <ul className="space-y-1 text-sm text-slate-600">{ACTIVE_RATE_ITEMS.filter(item => before.data[item.key] !== after.data[item.key]).map(item => <li key={item.key}>{item.service} · {item.mode === "Whole plasmid" ? "≤12 kb" : item.mode === "Whole plasmid >12 kb" ? ">12 kb" : item.mode} · {item.container}: {description(before.data[item.key])} → {description(after.data[item.key])} / {item.unit}</li>)}</ul> : <p className="text-sm text-slate-500">Historical price details are unavailable.</p>}</li>;
      })}</ul> : <p className="mt-4 text-sm text-slate-500">No customer price changes have been saved. This account follows the default price schedule.</p>}
    </details>
    <div><div className="mb-4"><h2 className="text-xl font-bold">Saved delivery & billing</h2><p className="mt-2 text-sm text-slate-500">Current preferences saved by this customer. Each historical order retains the contact and billing details supplied at submission.</p></div>
      {defaults.success ? <div className="grid gap-5 lg:grid-cols-2"><section className="panel p-5 sm:p-6"><h3 className="font-bold">Delivery contact</h3><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Detail label="Contact name">{defaults.data.contactName}</Detail><Detail label="Contact phone">{defaults.data.contactPhone}</Detail><Detail label="Delivery method">{defaults.data.deliveryMethod}</Detail><Detail label="PI">{defaults.data.piName}</Detail>{defaults.data.deliveryMethod === "Pickup" && <><Detail label="Pickup location">{defaults.data.pickupLocation}</Detail><Detail label="Pickup instructions">{defaults.data.pickupInstructions}</Detail></>}</dl></section><section className="panel p-5 sm:p-6"><h3 className="font-bold">Billing contact</h3><dl className="mt-5 grid gap-5 sm:grid-cols-2"><Detail label="Billing organization">{defaults.data.billingOrganization}</Detail><Detail label="Billing contact">{defaults.data.billingContactName}</Detail><Detail label="Billing email">{defaults.data.billingEmail ? <a href={`mailto:${defaults.data.billingEmail}`} className="text-cyan-800">{defaults.data.billingEmail}</a> : null}</Detail><Detail label="Payment method">{defaults.data.paymentMethod}</Detail><Detail label="Billing address">{defaults.data.billingAddress}</Detail></dl></section></div> : <div className="panel p-6 text-sm text-slate-500">No reusable delivery or billing details have been saved.{latest && <> Open <Link className="font-semibold text-cyan-800" href={`/admin/orders/${latest.id}`}>{latest.orderNumber}</Link> to view the details submitted with the latest order.</>}</div>}
    </div>
    <AdminOrders query={await searchParams} base={`/admin/customers/${customer.id}`} customerId={customer.id} title="Order history" />
  </div>;
}
