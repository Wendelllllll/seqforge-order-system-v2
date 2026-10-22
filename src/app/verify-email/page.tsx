import type { Metadata } from "next";

import { EmailVerification } from "@/components/email-verification";
import { safeOrderReturn } from "@/lib/order-resume";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Verify your email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const query = await searchParams;
  const next = safeOrderReturn(query.next) || "/dashboard";
  const session = await getSession();
  // Verification links and session snapshots are not proof of current verification.
  const customer = session ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true, emailVerified: true, role: true } }) : null;

  return <EmailVerification
    key={customer?.email || "signed-out"}
    email={customer?.email || null}
    initiallyVerified={customer?.emailVerified === true}
    next={customer?.role === "admin" ? "/admin" : next}
    linkError={typeof query.error === "string"}
  />;
}
