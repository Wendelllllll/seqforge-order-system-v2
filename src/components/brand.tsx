import Link from "next/link";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`seqforge-wordmark ${inverse ? "wordmark-inverse" : ""}`} aria-label="SeqForge home">
    <span>SeqForge<span className="wordmark-dot">.</span></span>
    <small>GENOMIC SCIENCE</small>
  </Link>;
}
