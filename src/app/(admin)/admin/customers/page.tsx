import Link from "next/link";
import { UsersRound, ArrowUpRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { formatDate } from "@/lib/orders";
import { customerFilters, customerWhere } from "@/lib/admin-customers";
import type { OrderQuery } from "@/lib/admin-order-filters";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<OrderQuery> }) {
  await requireAdmin();
  const filters = customerFilters(await searchParams);
  const where = customerWhere(filters);
  const [count, total, withOrders] = await Promise.all([
    prisma.user.count({ where }), prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "customer", orders: { some: {} } } }),
  ]);
  const pages = Math.max(1, Math.ceil(count / 25)); const page = Math.min(filters.page, pages);
  const customers = await prisma.user.findMany({ where, select: { id: true, name: true, email: true, phone: true, organization: true, labName: true, createdAt: true, _count: { select: { orders: true } }, orders: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, orderNumber: true, createdAt: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 25, take: 25 });
  const pageUrl = (next: number) => `/admin/customers?${new URLSearchParams({ q: filters.q, orders: filters.orders, page: String(next) })}`;
  return <div className="space-y-7">
    <div><p className="eyebrow">Laboratory operations</p><h1 className="mt-2 text-3xl font-bold">Customer management</h1><p className="mt-3 text-sm text-slate-500">Find customer contacts, account details and their submitted orders.</p></div>
    <div className="grid gap-4 sm:grid-cols-3">{[{ label: "Customers", value: total }, { label: "With orders", value: withOrders }, { label: "No orders yet", value: total - withOrders }].map(item => <div className="panel p-5" key={item.label}><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p><p className="mt-3 text-3xl font-bold">{item.value}</p></div>)}</div>
    <section className="panel overflow-hidden"><div className="panel-heading"><div><h2 className="text-lg font-bold">Customer directory</h2><p className="mt-1 text-sm text-slate-500">Newest accounts first · Select a customer to view their profile</p></div><span className="metric-pill">{count} matching</span></div>
      <form key={JSON.stringify(filters)} action="/admin/customers" className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50/70 p-5">
        <label className="min-w-56 flex-1"><span className="field-label">Search customers</span><input type="search" name="q" defaultValue={filters.q} className="field-input mt-2" placeholder="Name, email, organization, lab or phone" maxLength={120} /></label>
        <label><span className="field-label">Order activity</span><select name="orders" defaultValue={filters.orders} className="field-input mt-2"><option value="">All customers</option><option value="with">With orders</option><option value="without">No orders yet</option></select></label>
        <button className="button-primary" type="submit">Search customers</button><Link className="button-secondary" href="/admin/customers">Clear filters</Link>
      </form>
      {customers.length ? <div className="overflow-x-auto"><table className="data-table min-w-[1000px]"><thead><tr><th>Customer</th><th>Organization / lab</th><th>Contact</th><th>Orders</th><th>Latest order</th><th>Joined</th><th><span className="sr-only">Open profile</span></th></tr></thead><tbody>{customers.map(customer => <tr key={customer.id}>
        <td><Link href={`/admin/customers/${customer.id}`} className="font-bold text-cyan-800">{customer.name}</Link></td>
        <td><p>{customer.organization || "Not provided"}</p><p className="mt-1 text-xs text-slate-500">{customer.labName || "Lab not provided"}</p></td>
        <td><a className="break-all text-cyan-800" href={`mailto:${customer.email}`}>{customer.email}</a><p className="mt-1 text-xs text-slate-500">{customer.phone || "Phone not provided"}</p></td>
        <td className="font-semibold">{customer._count.orders}</td>
        <td>{customer.orders[0] ? <><Link className="font-mono text-xs text-cyan-800" href={`/admin/orders/${customer.orders[0].id}`}>{customer.orders[0].orderNumber}</Link><p className="mt-1 text-xs text-slate-500">{formatDate(customer.orders[0].createdAt)}</p></> : <span className="text-slate-400">No orders yet</span>}</td>
        <td>{formatDate(customer.createdAt)}</td><td><Link href={`/admin/customers/${customer.id}`} className="inline-flex items-center gap-1 font-bold text-cyan-700">View customer<ArrowUpRight size={14} /></Link></td>
      </tr>)}</tbody></table></div> : <div className="p-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-slate-300" /><h3 className="mt-3 font-bold">No matching customers</h3><p className="mt-2 text-sm text-slate-500">Try a different name or clear the filters.</p></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-5 text-sm"><p>{count ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}` : "0 customers"} · Page {page} of {pages}</p><nav className="flex gap-3" aria-label="Customer pages">{page > 1 && <Link href={pageUrl(page - 1)} className="button-secondary">Previous</Link>}{page < pages && <Link href={pageUrl(page + 1)} className="button-secondary">Next</Link>}</nav></div>
    </section>
  </div>;
}
