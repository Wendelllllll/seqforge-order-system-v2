"use client";

import { ArrowRight, CircleHelp, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { createElement, useState } from "react";

import { Brand } from "@/components/brand";
import styles from "@/components/email-verification.module.css";
import { verificationPageUrl } from "@/lib/verification-return";

export function EmailConfirmation({ token, next }: { token: string; next: string }) {
  const [submitting, setSubmitting] = useState(false);
  return <main className={styles.page}>
    <header className={styles.header}><Brand /><Link href="/contact" className={styles.help}><CircleHelp size={17} /> Contact support</Link></header>
    <div className={styles.main}>
      <section className={styles.card} aria-labelledby="confirmation-title">
        <div className={styles.content}>
          <div className={styles.statusPill}><ShieldCheck size={15} /> ACCOUNT VERIFICATION</div>
          <h1 id="confirmation-title">One more step</h1>
          <p className={styles.description}>Confirm the email address that received this link to continue with your SeqForge account.</p>
          <form action="/api/account/email-verification/confirm" method="post" onSubmit={() => setSubmitting(true)}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="next" value={next} />
            <button type="submit" disabled={submitting} className={styles.primary}>
              {submitting ? <LoaderCircle size={17} className={styles.spinner} /> : <ShieldCheck size={17} />}
              {submitting ? "Confirming your email…" : "Confirm my email"}
            </button>
          </form>
          <div className={styles.reassurance}><ShieldCheck size={17} /><p>Confirming your email does not submit an order. Your draft stays in the browser where you started it.</p></div>
          <p className={styles.description}>If this link opened on another device, return to your original browser after confirming. You may be asked to sign in.</p>
          <Link href={verificationPageUrl(next)} className={styles.back}>Back to my account <ArrowRight size={14} /></Link>
        </div>
        <aside className={styles.guide} aria-label="Your SeqForge connection">
          <Script src="/brand/verification-connection.js" strategy="afterInteractive" />
          {createElement("seqforge-connection", { state: "confirm", "asset-prefix": "/brand" })}
          <div className={styles.connectionHelp}><span>01 / Open your email</span><span>02 / Confirm your email</span><span>03 / Continue your order</span></div>
        </aside>
      </section>
    </div>
    <footer className={styles.footer}><span>SeqForge Inc. · San Diego, California</span><Link href="/contact">Contact our team</Link></footer>
  </main>;
}
