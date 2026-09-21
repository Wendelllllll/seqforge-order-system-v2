import type { ReactNode } from "react";

import { SequenceArt } from "@/components/sequence-art";
import { Brand } from "@/components/brand";

export function AuthPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[0.85fr_1.15fr]">
      <section className="auth-art-panel relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <SequenceArt id="auth" />
        <div className="relative"><Brand inverse /></div>
        <div className="relative max-w-lg">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-200">Forging the Future of Genomic Science</p>
          <p className="auth-statement mt-5">A direct path from sample submission to sequencing results.</p>
          <div className="mt-8 h-px w-20 bg-sky-200" />
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
