import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderForm } from "@/components/order-form";
import { ReadyOrderForm } from "@/components/ready-order-form";
import { OrderSteps, ServiceOptions, ServicePicker, ServicePlaceholder } from "@/components/order-service-picker";
import { ORDER_SERVICES, orderServiceUrl } from "@/lib/order-services";

export const metadata: Metadata = { title: "New order" };

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { blankDefaults, readDefaults } from "@/lib/order-defaults";
import { getRateSchedule } from "@/lib/pricing-store";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string | string[]; type?: string | string[] }> }) {
  const session = await getSession();
  if (session?.user.role === "admin") redirect("/admin");
  const query = await searchParams;
  const service = ORDER_SERVICES.find(item => item.id === query.service);
  const option = service?.options.find(item => item.id === query.type);
  if ((query.service !== undefined && !service) || (query.type !== undefined && !option)) redirect(orderServiceUrl(service?.id));

  if (!service || (service.options.length > 0 && !option) || !["sanger", "whole-plasmid"].includes(service.id)) {
    return <div className="mx-auto max-w-6xl">
      <OrderSteps service={service} option={option} />
      {!service ? <ServicePicker /> : service.options.length && !option ? <ServiceOptions service={service} /> : <ServicePlaceholder service={service} option={option} />}
    </div>;
  }

  const user = session ? await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }) : null;
  const plasmid = service.id === "whole-plasmid";
  const initialSchedule = await getRateSchedule(prisma);
  const defaults = user ? user.orderDefaults ? readDefaults(user.orderDefaults) : { ...blankDefaults(), contactName: user.name, contactPhone: user.phone || "", billingOrganization: user.organization } : blankDefaults();
  return (
    <div className="mx-auto sanger-order-page">
      <OrderSteps service={service} option={option} />
      <Link href={orderServiceUrl(plasmid ? undefined : service.id)} className="order-back"><ArrowLeft size={16} aria-hidden="true" /> {plasmid ? "All services" : "Change submission type"}</Link>
      <div>
        <p className="eyebrow">New order</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{plasmid ? "Create a Whole Plasmid sequencing order" : "Create a Sanger sequencing order"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Enter samples or paste directly from Excel, then confirm delivery and billing. {plasmid ? "Your sample count and sequencing total are calculated for you." : "Sample and reaction counts are calculated for you."}</p>
      </div>
      <div className="mt-8">{!plasmid && option!.submissionMode === "Ready to load" ? <ReadyOrderForm key={`ready:${user?.id || "guest"}`} userId={user?.id || null} defaults={defaults} initialSchedule={initialSchedule} initialSubmissionMode="Ready to load" /> : <OrderForm key={`${plasmid ? "whole-plasmid" : option!.id}:${user?.id || "guest"}`} userId={user?.id || null} defaults={defaults} initialSchedule={initialSchedule} initialSubmissionMode={plasmid ? "Whole plasmid" : option!.submissionMode} />}</div>
    </div>
  );
}
