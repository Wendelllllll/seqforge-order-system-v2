"use client";

import {
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Plus,
  ArrowUpRight,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { Brand } from "@/components/brand";

type ShellUser = {
  name: string;
  email: string;
  organization?: string | null;
  labName?: string | null;
};

const customerNavigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/orders/new", label: "New order", icon: Plus },
  { href: "/account", label: "Account", icon: UserRound },
];

const adminNavigation = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin#orders", label: "Orders", icon: ClipboardList },
  { href: "/admin#customers", label: "Customers", icon: UsersRound },
  { href: "/admin#results", label: "Results", icon: FlaskConical },
];

export function PortalShell({
  user,
  role,
  children,
}: {
  user: ShellUser;
  role: "customer" | "admin";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = role === "admin" ? adminNavigation : customerNavigation;

  async function signOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="portal-shell min-h-screen">
      <header className="workspace-header"><Brand /><div className="workspace-identity"><span>{user.name}</span><button type="button" onClick={signOut}><LogOut size={16} /> Log out</button></div></header>
      <div className="workspace-navigation"><span>{role === "admin" ? "LABORATORY OPERATIONS" : "YOUR RESEARCH WORKSPACE"}</span><nav aria-label="Primary navigation">{navigation.map(item => { const Icon=item.icon; const active=!item.href.includes("#") && (item.href === "/orders" ? pathname === "/orders" || (pathname.startsWith("/orders/") && pathname !== "/orders/new") : pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin/"))); return <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} className={active ? "workspace-active" : ""}><Icon size={17}/>{item.label}</Link> })}</nav><a href="/">Explore SeqForge <ArrowUpRight size={15}/></a></div>
      <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      <footer className="workspace-footer">SeqForge Inc. <a href="/contact">Contact our team</a></footer>
    </div>
  );
}
