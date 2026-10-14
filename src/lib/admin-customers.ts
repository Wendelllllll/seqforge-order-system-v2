import type { Prisma } from "@prisma/client";
import type { OrderQuery } from "./admin-order-filters";

export function customerFilters(query: OrderQuery) {
  const text = (key: string) => typeof query[key] === "string" ? query[key].trim() : "";
  const rawPage = Number(text("page"));
  return { q: text("q").slice(0, 120), orders: ["with", "without"].includes(text("orders")) ? text("orders") : "", page: Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1 };
}
export function customerWhere(filters: ReturnType<typeof customerFilters>): Prisma.UserWhereInput {
  const search = { contains: filters.q, mode: "insensitive" as const };
  return { role: "customer",
    ...(filters.q ? { OR: [{ name: search }, { email: search }, { organization: search }, { labName: search }, { phone: search }] } : {}),
    ...(filters.orders === "with" ? { orders: { some: {} } } : filters.orders === "without" ? { orders: { none: {} } } : {}),
  };
}
