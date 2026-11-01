import type { Metadata } from "next";
import { LoginPageLayout } from "@/components/login-page-layout";
import { ForgotPasswordForm } from "@/components/password-reset-form";
import { safeAuthReturn } from "@/lib/order-resume";

export const metadata: Metadata = { title: "Forgot your password", robots: { index: false, follow: false } };
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeAuthReturn((await searchParams).next);
  return <LoginPageLayout eyebrow="Account recovery" title="Forgot your password?" description="Enter your account email and we’ll help you get back to your science."><ForgotPasswordForm next={next} /></LoginPageLayout>;
}
