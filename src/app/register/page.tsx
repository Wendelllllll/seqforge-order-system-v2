import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-page";
import { RegisterForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(session.user.role === "admin" ? "/admin" : "/dashboard");

  return (
    <AuthPage eyebrow="Customer registration" title="Create your laboratory account" description="Register once to submit Sanger orders and keep results organized by laboratory.">
      <RegisterForm />
    </AuthPage>
  );
}
