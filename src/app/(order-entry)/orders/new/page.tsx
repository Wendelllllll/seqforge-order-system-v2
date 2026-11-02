import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OrderForm } from "@/components/order-form";
import { OligoOrderForm } from "@/components/oligo-order-form";
import { OrderSteps, ServiceOptions, ServicePicker, ServicePlaceholder } from "@/components/order-service-picker";
import { ORDER_SERVICES, orderServiceUrl } from "@/lib/order-services";

export const metadata: Metadata = { title: "New order" };

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { blankDefaults, readDefaults } from "@/lib/order-defaults";
import { getRateSchedule } from "@/lib/pricing-store";
import { getEffectiveRateSchedule } from "@/lib/customer-pricing-store";
import { listDropboxes } from "@/lib/dropbox-store";
import { dropboxSnapshot } from "@/lib/dropboxes";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ service?: string | string[]; type?: string | string[]; retired?: string | string[]; dropbox?: string | string[] }> }) {
  const session = await getSession();
  if (session?.user.role === "admin") redirect("/admin");
  const query = await searchParams;
  const dropboxId = typeof query.dropbox === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(query.dropbox) ? query.dropbox : undefined;
  if (query.service === "sanger" && query.type === "ready-to-load") redirect("/orders/new?service=sanger&retired=ready-to-load");
  const service = ORDER_SERVICES.find(item => item.id === query.service);
  const option = service?.options.find(item => item.id === query.type);
  if ((query.service !== undefined && !service) || (query.type !== undefined && !option)) redirect(orderServiceUrl(service?.id));

  if (!service || (service.options.length > 0 && !option) || !["sanger", "whole-plasmid", "oligo", "fragment-analysis"].includes(service.id)) {
    return <div className="mx-auto max-w-6xl">
      <OrderSteps service={service} option={option} />
      {service?.id === "sanger" && query.retired === "ready-to-load" && <p role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This submission type is no longer offered. Choose Standard or Pre-mixed to start a new order.</p>}
      {!service ? <ServicePicker dropboxId={dropboxId} /> : service.options.length && !option ? <ServiceOptions service={service} dropboxId={dropboxId} /> : <ServicePlaceholder service={service} option={option} />}
    </div>;
  }

  const user = session ? await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } }) : null;
  const plasmid = service.id === "whole-plasmid";
  const oligo = service.id === "oligo";
  const fragment = service.id === "fragment-analysis";
  const initialSchedule = user ? await getEffectiveRateSchedule(prisma, user.id) : await getRateSchedule(prisma);
  const defaults = user ? user.orderDefaults ? readDefaults(user.orderDefaults) : { ...blankDefaults(), contactName: user.name, contactPhone: user.phone || "", billingOrganization: user.organization } : blankDefaults();
  if (oligo) { defaults.deliveryMethod = "Pickup"; delete defaults.dropboxId; delete defaults.dropbox; }
  else {
    // New sequencing orders open the location picker; restored drafts retain their own delivery choice.
    if (defaults.deliveryMethod !== "Dropbox") { delete defaults.dropboxId; delete defaults.dropbox; }
    defaults.deliveryMethod = "Dropbox";
  }
  const selectedDropbox = !oligo && dropboxId ? (await listDropboxes(prisma)).find(location => location.id === dropboxId) : null;
  if (selectedDropbox) { defaults.deliveryMethod = "Dropbox"; defaults.dropboxId = selectedDropbox.id; defaults.dropbox = dropboxSnapshot(selectedDropbox); }
  return (
    <div className="mx-auto sanger-order-page">
      <OrderSteps service={service} option={option} />
      <Link href={orderServiceUrl(plasmid || fragment ? undefined : service.id)} className="order-back"><ArrowLeft size={16} aria-hidden="true" /> {plasmid || fragment ? "All services" : "Change submission type"}</Link>
      <div>
        <p className="eyebrow">New order</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{fragment ? "Create a Fragment Analysis order" : oligo ? "Create an Oligo synthesis order" : plasmid ? "Create a Whole Plasmid sequencing order" : "Create a Sanger sequencing order"}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{fragment ? "Enter your fluorescently labeled PCR samples and analysis requirements. The laboratory will confirm specifications and pricing before analysis." : oligo ? "Enter sequences or paste directly from Excel, then confirm delivery and billing. We’ll review your specifications and confirm a quote before production." : <>Enter samples or paste directly from Excel, then confirm delivery and billing. {plasmid ? "Your sample count and sequencing total are calculated for you." : "Sample and reaction counts are calculated for you."}</>}</p>
      </div>
      <div className="mt-8">{oligo ? <OligoOrderForm key={`oligo:${option!.id}:${user?.id || "guest"}`} userId={user?.id || null} defaults={defaults} initialSchedule={initialSchedule} modified={option!.id === "modified"} /> : <OrderForm key={`${fragment ? "fragment-analysis" : plasmid ? "whole-plasmid" : option!.id}:${user?.id || "guest"}:${selectedDropbox?.id || "no-map-selection"}`} userId={user?.id || null} defaults={defaults} requestedDropbox={selectedDropbox ? dropboxSnapshot(selectedDropbox) : undefined} initialSchedule={initialSchedule} initialSubmissionMode={fragment ? "Fragment analysis" : plasmid ? "Whole plasmid" : option!.submissionMode} />}</div>
    </div>
  );
}
