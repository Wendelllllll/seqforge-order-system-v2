import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-page";
import { LoginForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <AuthPage eyebrow="Welcome back" title="Sign in to SeqForge" description="Access your sequencing orders, laboratory status, and completed results.">
      <LoginForm />
      {process.env.SHOW_DEMO_ACCOUNTS === "true" && process.env.BETTER_AUTH_URL === "http://localhost:3000" ? <div className="mt-8 border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
        <p className="font-bold text-slate-800">Local demo accounts</p>
        <p className="mt-1">Customer: scientist@demo.local / DemoCustomer!2026</p>
        <p>Admin: admin@seqforge.local / SeqForgeDemo!2026</p>
      </div> : null}
    </AuthPage>
  );
}
