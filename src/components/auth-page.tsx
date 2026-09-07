import type { ReactNode } from "react";

import { Brand } from "@/components/brand";

export function AuthPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.85fr_1.15fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-20" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #22d3ee 0, transparent 22%), radial-gradient(circle at 80% 70%, #0e7490 0, transparent 28%)" }} />
        <div className="relative"><Brand inverse /></div>
        <div className="relative max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Forging the Future of Genomic Science</p>
          <p className="mt-5 text-3xl font-bold leading-tight tracking-tight">A direct path from sample submission to sequencing results.</p>
          <div className="mt-8 h-px w-20 bg-cyan-400" />
        </div>
        <p className="relative text-xs text-slate-500">SeqForge, Inc. · San Diego, California</p>
      </section>
      <section className="flex items-center justify-center bg-white px-5 py-12 sm:px-8">
        <div className="w-full max-w-xl">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}
