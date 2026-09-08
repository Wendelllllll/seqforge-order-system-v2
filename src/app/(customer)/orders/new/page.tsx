import type { Metadata } from "next";

import { OrderForm } from "@/components/order-form";

export const metadata: Metadata = { title: "New Sanger order" };

export default function NewOrderPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <div>
        <p className="eyebrow">New order</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Create a Sanger sequencing order</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Choose a service, add or import physical samples and their primer reactions, then review the submission manifest. Required fields are marked with an asterisk.</p>
      </div>
      <div className="mt-8"><OrderForm /></div>
    </div>
  );
}
