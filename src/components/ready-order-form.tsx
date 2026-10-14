"use client";

import { OrderForm } from "@/components/order-form";

// Ready to load shares the same entry, import, draft and submission flow.
export function ReadyOrderForm(props: React.ComponentProps<typeof OrderForm>) {
  return <OrderForm {...props} initialSubmissionMode="Ready to load" />;
}
