import { AdminOrders } from "@/components/admin-orders";
import { requireAdmin } from "@/lib/session";
import type { OrderQuery } from "@/lib/admin-order-filters";
export default async function OrdersPage({ searchParams }: { searchParams: Promise<OrderQuery> }) {
  await requireAdmin();
  return <div><p className="eyebrow">Laboratory operations</p><h1 className="mt-2 text-3xl font-bold">Order management</h1><p className="mt-3 text-sm text-slate-500">Find customer submissions and continue laboratory processing.</p><AdminOrders query={await searchParams} /></div>;
}
