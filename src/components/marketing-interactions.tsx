"use client";

import Link from "next/link";
import { ArrowUpRight, Menu, X, Plus } from "lucide-react";
import { useId, useState } from "react";
import { Brand } from "./brand";
import { RATE_CENTS, formatMoney } from "@/lib/pricing";
import { CONTAINERS, MODES } from "@/lib/order-intake";

const navigation = [{ href: "#services", label: "Services" }, { href: "#approach", label: "Our approach" }, { href: "#pricing", label: "Pricing" }, { href: "#resources", label: "Resources" }];
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return <header className="marketing-header">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Brand />
    <nav className="desktop-links" aria-label="Website navigation">{navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
    <div className="marketing-header-actions"><Link className="header-signin" href="/login">Sign in</Link><Link className="site-button light small" href="/orders/new">Start an order <ArrowUpRight size={16} /></Link><button className="mobile-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="website-mobile-menu" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div>
    {<nav inert={!open} data-open={open} id="website-mobile-menu" className="mobile-site-menu" aria-label="Mobile website navigation" onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>(".mobile-menu-toggle")?.focus(); } }}>{navigation.map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}<ArrowUpRight size={18} /></a>)}<Link href="/login" onClick={() => setOpen(false)}>Customer sign in <ArrowUpRight size={18} /></Link></nav>}
  </header>;
}

export function PricingExplorer() {
  const [container, setContainer] = useState<(typeof CONTAINERS)[number]>("Plate");
  const [mode, setMode] = useState<(typeof MODES)[number]>("Pre-mixed");
  const [quantity, setQuantity] = useState("96");
  const number = Number(quantity);
  const valid = quantity.trim() !== "" && Number.isInteger(number) && number >= 1 && number <= 250;
  const rate = RATE_CENTS[container][mode];
  return <div className="pricing-explorer">
    <div className="pricing-controls">
      <fieldset><legend>01 / Sample format</legend><div className="format-switch" data-container={container}>{CONTAINERS.map((item) => <button key={item} type="button" aria-pressed={container === item} onClick={() => setContainer(item)}>{item === "Plate" ? "96-well plates" : "Individual tubes"}</button>)}</div></fieldset>
      <label className="pricing-label">02 / Submission mode<select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>{MODES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="pricing-label" htmlFor="reaction-quantity">03 / Number of reactions</label>
      <div className="quantity-inputs"><input aria-label="Adjust number of reactions" type="range" min="1" max="250" value={valid ? number : 1} onChange={(e) => setQuantity(e.target.value)} /><input id="reaction-quantity" type="number" min="1" max="250" step="1" value={quantity} aria-describedby="quantity-hint" aria-invalid={!valid} onChange={(e) => setQuantity(e.target.value)} /></div>
      <p id="quantity-hint">{valid ? "Each sample–primer combination counts as one reaction." : "Enter a whole number between 1 and 250."}</p>
    </div>
    <div className="pricing-total"><span className="site-kicker">Sequencing subtotal / USD</span><div aria-live="polite" aria-atomic="true"><p className="estimate-number">{valid ? formatMoney(rate * number) : "—"}</p><p className="estimate-breakdown">{valid ? `${number} reactions × ${formatMoney(rate)} per reaction` : "Choose a valid reaction count to see your estimate."}</p></div><p className="estimate-note">Sequencing only. Shipping, taxes, preparation and special services are additional. Final requirements and any extra charges need lab review.</p><Link className="site-button light" href="/orders/new">Create your order <ArrowUpRight size={18} /></Link><p className="estimate-footnote">Estimate only. Configure your samples in the order form.</p></div>
  </div>;
}

export function SmoothFaq({ items }: { items: string[][] }) {
  const prefix = useId();
  const [opened, setOpened] = useState<number | null>(null);
  return <div className="faq-list smooth-faq">{items.map(([question, answer], i) => {
    const open = opened === i;
    return <div className="faq-item" key={question} data-open={open}>
      <h3><button id={`${prefix}-question-${i}`} aria-expanded={open} aria-controls={`${prefix}-answer-${i}`} onClick={() => setOpened(open ? null : i)}>{question}<Plus size={19} aria-hidden="true" /></button></h3>
      <div id={`${prefix}-answer-${i}`} className="faq-answer" role="region" aria-labelledby={`${prefix}-question-${i}`} inert={!open} aria-hidden={!open}><div><p>{answer}</p></div></div>
    </div>;
  })}</div>;
}
