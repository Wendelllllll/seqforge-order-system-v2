import type { Metadata } from "next";
import Link from "next/link";
import { LoginPageLayout } from "@/components/login-page-layout";
import { ResetPasswordForm } from "@/components/password-reset-form";
import { safeAuthReturn } from "@/lib/order-resume";
import { resetPasswordSchema } from "@/lib/password-reset";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false }, referrer: "same-origin" };
export const dynamic = "force-dynamic";
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[]; next?: string | string[] }> }) {
  const query = await searchParams;
  const next = safeAuthReturn(query.next);
  const token = resetPasswordSchema.shape.token.safeParse(query.token);
  // GET only renders a form. Tokens are consumed only by the explicit reset POST.
  return <LoginPageLayout eyebrow="Account recovery" title="Choose a new password" description="Set a new password for the account that received your reset email.">
    {token.success ? <ResetPasswordForm token={token.data} next={next} /> : <div className="space-y-5"><p className="text-sm leading-6 text-slate-600">Open the complete reset link from your email, or request a new one.</p><Link className="button-primary" href={next ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password"}>Request a reset link</Link></div>}
  </LoginPageLayout>;
}
