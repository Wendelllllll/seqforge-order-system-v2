import type { Prisma } from "@prisma/client";
import { isOrderStatus } from "./orders";

export type OrderQuery = Record<string, string | string[] | undefined>;
export function parseOrderFilters(query: OrderQuery) {
  const value = (key: string) => typeof query[key] === "string" ? query[key].trim() : "";
  const rawPage = Number(value("page"));
  return {
    q: value("q").slice(0, 120),
    service: ["SANGER", "WHOLE_PLASMID"].includes(value("service")) ? value("service") : "",
    mode: ["Standard", "Pre-mixed", "Ready to load", "Whole plasmid"].includes(value("mode")) ? value("mode") : "",
    status: isOrderStatus(value("status")) ? value("status") : "",
    customer: value("customer").slice(0, 128),
    page: Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1,
  };
}
export function orderFilterWhere(filters: ReturnType<typeof parseOrderFilters>): Prisma.OrderWhereInput {
  const search = { contains: filters.q, mode: "insensitive" as const };
  return {
    ...(filters.service ? { service: filters.service } : {}),
    ...(filters.mode ? { submissionMode: filters.mode } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customer ? { userId: filters.customer } : {}),
    ...(filters.q ? { OR: [
      { orderNumber: search }, { orderName: search }, { poNumber: search },
      { user: { name: search } }, { user: { email: search } }, { user: { organization: search } }, { user: { labName: search } },
      { samples: { some: { sampleName: search } } },
    ] } : {}),
  };
}
