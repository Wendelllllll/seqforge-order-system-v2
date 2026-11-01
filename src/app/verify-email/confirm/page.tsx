import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { EmailConfirmation } from "@/components/email-confirmation";
import { safeVerificationReturn, verificationPageUrl } from "@/lib/verification-return";

export const metadata: Metadata = {
  // Suppress token-bearing referrers to other sites while retaining the Origin
  // header on the same-origin native confirmation form.
  title: "Confirm your email", robots: { index: false, follow: false }, referrer: "same-origin",
};
export const dynamic = "force-dynamic";

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[]; next?: string | string[] }> }) {
  const query = await searchParams;
  const next = safeVerificationReturn(query.next);
  if (typeof query.token !== "string" || !query.token || query.token.length > 4096) {
    redirect(`${verificationPageUrl(next)}&error=INVALID_TOKEN`);
  }
  // Rendering this page is deliberately passive, including for signed-out visitors.
  return <EmailConfirmation token={query.token} next={next} />;
}
