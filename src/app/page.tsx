import { ArrowRight, Beaker, CheckCircle2, ClipboardCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(session.user.role === "admin" ? "/admin" : "/dashboard");
  }

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <div className="flex items-center gap-3">
            <Link href="/login" className="px-3 py-2 text-sm font-bold text-slate-600 hover:text-slate-950">Sign in</Link>
            <Link href="/register" className="button-primary">Create account <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950 text-white">
        <div className="absolute inset-y-0 right-0 w-1/2 opacity-30" aria-hidden="true" style={{ backgroundImage: "linear-gradient(135deg, transparent 25%, #0891b2 25%, #0891b2 26%, transparent 26%, transparent 50%, #0891b2 50%, #0891b2 51%, transparent 51%)", backgroundSize: "48px 48px" }} />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:py-28">
          <div>
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Sequencing services portal</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">Submit Sanger sequencing orders with clarity and speed.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">A focused workspace for researchers to prepare samples, follow laboratory progress, and retrieve sequencing results.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="button-primary bg-cyan-500 text-slate-950 hover:bg-cyan-400">Start a new order <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/login" className="inline-flex min-h-10 items-center border border-white/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">Sign in to your account</Link>
            </div>
          </div>
          <div className="self-end border border-white/15 bg-white/5 p-6 backdrop-blur-sm lg:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Prototype workflow</p>
            <ol className="mt-5 space-y-4">
              {[
                "Create your order and add samples",
                "SeqForge receives and processes the order",
                "Track each laboratory status update",
                "Download completed result files",
              ].map((item, index) => (
                <li key={item} className="flex items-center gap-4 text-sm text-slate-200">
                  <span className="grid h-7 w-7 shrink-0 place-items-center border border-cyan-400/40 text-xs font-bold text-cyan-300">{index + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        <div className="grid gap-px border border-slate-200 bg-slate-200 md:grid-cols-3">
          {[
            { icon: Beaker, title: "Built for Sanger", body: "Capture template, concentration, primer source, and sample notes in a structured order." },
            { icon: ClipboardCheck, title: "Visible progress", body: "Follow each order from submission through receipt, sequencing, QC, and completion." },
            { icon: ShieldCheck, title: "Controlled access", body: "Customer orders and uploaded results remain available only to authorized accounts." },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="bg-white p-7">
              <Icon className="h-6 w-6 text-cyan-700" />
              <h2 className="mt-5 text-lg font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
            </article>
          ))}
        </div>
        <div className="mt-10 flex items-center gap-3 text-sm text-slate-500">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Local prototype · No production or customer data
        </div>
      </section>
    </main>
  );
}
