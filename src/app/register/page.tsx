import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-page";
import { RegisterForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";
import { safeOrderReturn } from "@/lib/order-resume";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeOrderReturn((await searchParams).next);
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/admin" : next || "/dashboard");

  return (
    <AuthPage eyebrow="Customer registration" title="Create your laboratory account" description="Register once to submit Sanger orders and keep results organized by laboratory.">
      <RegisterForm next={next} />
    </AuthPage>
  );
}
