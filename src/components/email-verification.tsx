"use client";

import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronRight, CircleHelp, LoaderCircle, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Brand } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import styles from "@/components/email-verification.module.css";

type Delivery = "idle" | "sending" | "sent" | "preview" | "error";
type Props = { email: string | null; initiallyVerified: boolean; next: string; linkError: boolean };

export function EmailVerification({ email, initiallyVerified, next, linkError }: Props) {
  const router = useRouter();
  const [verified, setVerified] = useState(initiallyVerified);
  const [delivery, setDelivery] = useState<Delivery>("idle");
  const [error, setError] = useState(linkError ? "This verification link has expired or is no longer valid. Request a fresh link below." : "");
  const [notice, setNotice] = useState("");
  const [remaining, setRemaining] = useState(0);
  const [checking, setChecking] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [signedOut, setSignedOut] = useState(!email);
  const attempted = useRef(false);
  const sending = useRef(false);
  const checkInFlight = useRef(false);
  const orderReturn = next.startsWith("/orders/new");
  const returnToVerification = `/verify-email?next=${encodeURIComponent(next)}`;
  const loginUrl = `/login?next=${encodeURIComponent(returnToVerification)}`;

  const requestEmail = useCallback(async () => {
    if (sending.current || !email || verified) return;
    sending.current = true;
    setDelivery("sending");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/account/email-verification", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ next }),
      });
      const result = await response.json();
      if (response.status === 401) { setSignedOut(true); setDelivery("idle"); return; }
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) setRemaining(Math.min(Math.ceil(retryAfter), 3600));
        throw new Error(result.error || "We couldn't send the email just yet. Please try again.");
      }
      if (result.email !== email) { window.location.reload(); return; }
      if (result.verified === true) { setVerified(true); setDelivery("idle"); return; }
      if (result.delivery !== "sent" && result.delivery !== "preview") throw new Error("We couldn't confirm the email was sent. Please try again.");
      setDelivery(result.delivery);
      setRemaining(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't send the email. Check your connection and try again.");
      setDelivery("error");
    } finally { sending.current = false; }
  }, [email, next, verified]);

  const checkVerification = useCallback(async (quiet = false) => {
    if (!email || verified || checkInFlight.current) return;
    checkInFlight.current = true;
    if (!quiet) { setChecking(true); setNotice(""); }
    try {
      const response = await fetch("/api/account/email-verification", { cache: "no-store" });
      if (response.status === 401) { setSignedOut(true); return; }
      if (!response.ok) throw new Error("We couldn't check your email status. Please try again.");
      const result = await response.json();
      if (result.email !== email) { window.location.reload(); return; }
      if (result.verified === true) { setVerified(true); setError(""); setNotice(""); }
      else if (!quiet) setNotice("Not verified yet. Open the link in your email, then come back here.");
    } catch {
      if (!quiet) setNotice("We couldn't check your email status. Check your connection and try again.");
    } finally { checkInFlight.current = false; if (!quiet) setChecking(false); }
  }, [email, verified]);

  async function switchAccount() {
    setSwitchingAccount(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Unable to sign out");
      router.replace(loginUrl);
      router.refresh();
    } catch {
      setNotice("We couldn't sign you out. Please try again.");
      setSwitchingAccount(false);
    }
  }

  useEffect(() => {
    if (attempted.current || !email || verified || linkError) return;
    attempted.current = true;
    void Promise.resolve().then(() => requestEmail());
  }, [email, verified, linkError, requestEmail]);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  useEffect(() => {
    const onFocus = () => { void checkVerification(true); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [checkVerification]);

  // DESIGN REVIEW: visual layout and copy below are provisional; see DESIGN_HANDOFF.md.
  // Preserve the verification, resend, account and draft-return behavior above.
  const title = signedOut ? "Sign in to verify your email" : verified ? "Email verified" : "Verify your email";
  const description = signedOut
    ? "Sign in to your SeqForge account to confirm your email address and continue."
    : verified ? "Your email address has been confirmed. You can continue to your account or review your order."
      : "Confirm your email address before submitting your first order. Open the verification link in your inbox, then return here to continue.";

  return <main className={`${styles.page} ${verified ? styles.verified : ""}`}>
    <header className={styles.header}><Brand /><Link href="/contact" className={styles.help}><CircleHelp size={17} /> Contact support</Link></header>
    <div className={styles.main}>
      <nav aria-label="Account setup progress" className={styles.steps}>
        <span className={styles.done}><Check size={13} /> Your account</span>
        <ChevronRight size={14} aria-hidden="true" />
        <span className={styles.active} aria-current={verified ? undefined : "step"}>{verified ? <Check size={13} /> : <span className={styles.stepDot} />} Verify email</span>
        <ChevronRight size={14} aria-hidden="true" />
        <span>{orderReturn ? "Review order" : "Account dashboard"}</span>
      </nav>

      <section className={styles.card} aria-labelledby="verification-title">
        <div className={styles.content}>
          <div className={styles.statusPill}><ShieldCheck size={15} /> ACCOUNT VERIFICATION</div>
          <h1 id="verification-title">{title}</h1>
          <p className={styles.description}>{description}</p>

          {!signedOut && email && <div className={styles.emailBox}><span className={styles.emailIcon}>{verified ? <Check size={19} /> : <Mail size={19} />}</span><div><span>{verified ? "Verified email" : "Your account email"}</span><strong>{email}</strong></div></div>}

          <div className={styles.liveStatus} aria-live="polite" aria-atomic="true">
            {!signedOut && verified && <p className={styles.sentMessage}><Check size={16} /> Email verification complete.</p>}
            {!signedOut && !verified && delivery === "sent" && <p className={styles.sentMessage}><Check size={15} /> Verification email sent. Check your inbox and spam folder.</p>}
            {!signedOut && !verified && delivery === "sending" && <p className={styles.sendingMessage}><LoaderCircle size={15} className={styles.spinner} /> Sending your verification link…</p>}
            {!signedOut && !verified && delivery === "preview" && <p className={styles.notice}>Email preview is enabled for this test environment. No email was sent.</p>}
            {!signedOut && !verified && error && <p role="alert" className={styles.error}>{error}</p>}
            {!signedOut && !verified && notice && <p className={styles.notice}>{notice}</p>}
          </div>

          {signedOut ? <Link href={loginUrl} className={styles.primary}>Sign in to continue <ArrowRight size={17} /></Link>
            : verified ? <Link href={next} className={styles.primary}>{orderReturn ? "Back to my order" : next === "/admin" ? "Go to admin" : "Go to my dashboard"}<ArrowRight size={17} /></Link>
              : <>
                <button type="button" onClick={() => void checkVerification()} disabled={checking || delivery === "sending"} className={styles.primary}>{checking ? <LoaderCircle className={styles.spinner} size={17} /> : <CheckCheck size={18} />} {checking ? "Checking your email…" : "I've verified my email"}</button>
                <div className={styles.resend}><span>Need another link?</span><button type="button" onClick={() => void requestEmail()} disabled={remaining > 0 || delivery === "sending"}><RefreshCw size={13} />{remaining > 0 ? `Resend in ${remaining}s` : "Resend email"}</button></div>
                <div className={styles.resend}><button type="button" disabled={switchingAccount || delivery === "sending"} onClick={() => void switchAccount()}>{switchingAccount ? "Signing out…" : "Use a different account"}</button></div>
              </>}

          <div className={styles.reassurance}><ShieldCheck size={17} /><p>{orderReturn ? "Your draft is saved in this browser. Verification does not submit your order; you will review it before submission." : "Verification is required once for this email address, rather than for each order."}</p></div>
          {orderReturn && <Link href={next} className={styles.back}><ArrowLeft size={14} /> Back to editing my order</Link>}
        </div>
        <aside className={styles.guide} aria-label="Email verification guidance">
          <p className={styles.guideEyebrow}>SEQFORGE CUSTOMER PORTAL</p>
          <svg className={styles.trace} viewBox="0 0 240 80" fill="none" aria-hidden="true" focusable="false">
            <path d="M0 20H240M0 40H240M0 60H240M40 0V80M80 0V80M120 0V80M160 0V80M200 0V80" stroke="currentColor" strokeWidth=".5" opacity=".12" />
            <path d="M0 62H13C18 62 16 17 22 17S26 62 33 62H63C69 62 66 25 73 25S78 62 85 62H135C141 62 140 13 146 13S150 62 157 62H212C218 62 217 34 222 34S227 62 240 62" stroke="#168c83" strokeWidth="1.5" />
            <path d="M0 64H33C38 64 38 30 43 30S48 64 55 64H91C98 64 95 18 102 18S108 64 115 64H166C171 64 171 24 177 24S182 64 188 64H240" stroke="#426b96" strokeWidth="1.5" />
            <path d="M0 66H53C59 66 57 41 63 41S67 66 75 66H112C118 66 116 32 123 32S129 66 137 66H188C194 66 192 16 199 16S205 66 213 66H240" stroke="#8499ad" strokeWidth="1.2" />
          </svg>
          <h2>{verified ? "Continue your workflow" : "Before you continue"}</h2>
          <ol className={styles.guideSteps}>
            <li><span>01</span><div><strong>Check your inbox</strong><p>Look for the SeqForge verification email. Check your spam folder if needed.</p></div></li>
            <li><span>02</span><div><strong>Confirm your address</strong><p>The verification link is valid for one hour.</p></div></li>
            <li><span>03</span><div><strong>{orderReturn ? "Review your order" : "Return to your account"}</strong><p>{orderReturn ? "Continue with your saved sample details and submit when ready." : "Use your verified account for future orders."}</p></div></li>
          </ol>
          <div className={styles.supportNote}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/assets/seal-report.png" width={66} height={66} alt="" />
            <div><p>Questions about your order?</p><Link href="/contact">Contact the SeqForge team <ArrowRight size={12} /></Link></div>
          </div>
        </aside>
      </section>
      <p className={styles.footnote}>Sanger sequencing <span>·</span> Whole Plasmid sequencing <span>·</span> Oligo synthesis</p>
    </div>
    <footer className={styles.footer}><span>SeqForge Inc. · San Diego, California</span><Link href="/contact">Contact our team</Link></footer>
  </main>;
}
