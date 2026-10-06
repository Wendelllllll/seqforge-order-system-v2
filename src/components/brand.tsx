export function Brand({ inverse = false }: { inverse?: boolean }) {
 return <a href="/" className={`seqforge-wordmark ${inverse ? "wordmark-inverse" : ""}`} aria-label="SeqForge home">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/brand/assets/logo.webp" width="230" height="55" alt="SeqForge" />
 </a>;
}
