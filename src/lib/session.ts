import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireCustomer() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role === "admin") {
    redirect("/admin");
  }

  return session;
}

export async function requireAdmin() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return session;
}
