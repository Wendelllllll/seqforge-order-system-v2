import { ArrowLeft, ArrowRight, Check, CircleDot, Dna, FlaskConical, Waves } from "lucide-react";
import Link from "next/link";

import { ORDER_SERVICES, orderServiceUrl, type OrderService, type ServiceOption } from "@/lib/order-services";

export function OrderSteps({ service, option }: { service?: OrderService; option?: ServiceOption }) {
  const details = !!service && (!service.options.length || !!option);
  const steps = [
    { name: "Service", href: orderServiceUrl(), complete: !!service, current: !service },
    ...(service?.options.length || !service ? [{ name: "Options", href: orderServiceUrl(service?.id), complete: !!option, current: !!service && !details }] : []),
    { name: "Order details", href: "", complete: false, current: details },
  ];
  return <nav aria-label="Order progress" className="order-progress"><ol>
    {steps.map((step, index) => <li key={step.name} aria-current={step.current ? "step" : undefined}>
      {step.complete ? <Link href={step.href}><span><Check size={13} aria-hidden="true" /></span>{step.name}</Link> : <div><span>{index + 1}</span>{step.name}</div>}
    </li>)}
  </ol></nav>;
}

export function ServicePicker() {
  return <>
    <header className="order-picker-heading">
      <p className="eyebrow">New order</p>
      <h1>What would you like to order?</h1>
      <p>Choose a service to get started.</p>
    </header>
    <div className="order-service-grid">
      {ORDER_SERVICES.map((service, index) => {
        const Icon = service.id === "oligo" ? Dna : service.id === "whole-plasmid" ? CircleDot : Waves;
        return <Link key={service.id} href={orderServiceUrl(service.id)} className={`order-service-card order-service-${service.id}`}>
          <div className="order-service-art" aria-hidden="true"><span className="order-service-number">0{index + 1}</span><Icon strokeWidth={1.25} /><span className="order-service-motif">{service.id === "oligo" ? "A · T · G · C" : service.id === "whole-plasmid" ? "INSERT + BACKBONE" : "ONE REGION. CLEAR ANSWERS."}</span></div>
          <div className="order-service-content"><h2>{service.name}</h2><p>{service.description}</p><span className="order-service-caption">{service.caption}</span><span className="order-service-action">Select service <ArrowRight size={18} aria-hidden="true" /></span></div>
        </Link>;
      })}
    </div>
    <p className="order-picker-help">Looking for an existing order? <Link href="/orders">View your orders <ArrowRight size={14} aria-hidden="true" /></Link></p>
  </>;
}

export function ServiceOptions({ service }: { service: OrderService }) {
  return <>
    <Link href={orderServiceUrl()} className="order-back"><ArrowLeft size={16} aria-hidden="true" /> All services</Link>
    <header className="order-picker-heading">
      <p className="eyebrow">{service.name}</p>
      <h1>{service.id === "sanger" ? "How will you prepare your samples?" : "Which oligos do you need?"}</h1>
      <p>{service.id === "sanger" ? "Choose your submission type. You’ll select tubes or plates in the next step." : "Choose standard or modified DNA to continue."}</p>
    </header>
    <div className={`order-options-grid ${service.options.length === 2 ? "order-options-two" : ""}`}>
      {service.options.map((option, index) => <Link key={option.id} href={orderServiceUrl(service.id, option.id)} className="order-option-card">
        <span className="order-option-number">0{index + 1}</span>
        <h2>{option.name}</h2><p>{option.description}</p>
        <span className="order-service-action">Continue <ArrowRight size={18} aria-hidden="true" /></span>
      </Link>)}
    </div>
  </>;
}

export function ServicePlaceholder({ service, option }: { service: OrderService; option?: ServiceOption }) {
  return <>
    <Link href={orderServiceUrl(service.options.length ? service.id : undefined)} className="order-back"><ArrowLeft size={16} aria-hidden="true" /> {service.options.length ? "Change oligo type" : "All services"}</Link>
    <header className="order-picker-heading">
      <p className="eyebrow">New order · {service.shortName}</p>
      <h1>{option?.name || service.name}</h1>
      <p>{option?.description || service.description}</p>
    </header>
    <section className="order-placeholder" aria-labelledby="order-details-title">
      <div><FlaskConical size={28} strokeWidth={1.4} aria-hidden="true" /><h2 id="order-details-title">Order details</h2><span>Coming soon</span><p>The order form for this service is not available yet.</p></div>
    </section>
  </>;
}
