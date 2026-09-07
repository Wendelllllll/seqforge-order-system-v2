import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3" aria-label="SeqForge home">
      <span
        className={`grid h-9 w-9 place-items-center border text-sm font-bold tracking-tight ${
          inverse
            ? "border-white/30 bg-white text-slate-950"
            : "border-slate-300 bg-slate-950 text-white"
        }`}
        aria-hidden="true"
      >
        SF
      </span>
      <span className="leading-none">
        <span className={`block text-lg font-bold tracking-tight ${inverse ? "text-white" : "text-slate-950"}`}>
          SeqForge
        </span>
        <span className={`mt-1 block text-[10px] font-semibold uppercase tracking-[0.19em] ${inverse ? "text-cyan-200" : "text-cyan-700"}`}>
          Order System V2
        </span>
      </span>
    </Link>
  );
}
