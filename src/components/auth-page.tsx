import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
export function AuthPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
 return <main className="brand-auth"><header className="brand-auth-header"><Brand /><a href="/">Back to SeqForge</a></header>
 <div className="brand-auth-layout"><section className="brand-auth-intro"><p className="eyebrow">YOUR SCIENCE. CONNECTED.</p><h2>Read deeper.<br /><em>Sequence clearly.</em></h2><p>From your first sample to your next discovery. Keep your orders, sample details, and sequencing results together.</p><div className="brand-auth-visual" role="img" aria-label="DNA double helix in SeqForge navy and mint" /></section>
 <section className="brand-auth-card"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="brand-auth-description">{description}</p><div className="mt-8">{children}</div></section></div>
 <footer className="brand-auth-footer">SeqForge Inc. · San Diego, California <a href="/contact">Contact our team</a></footer></main>;
}
