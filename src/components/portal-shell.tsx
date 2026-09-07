"use client";

import {
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
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
  { href: "/admin#settings", label: "Settings", icon: Settings },
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
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-950 lg:flex">
        <div className="border-b border-white/10 px-6 py-6">
          <Brand inverse />
        </div>
        <div className="px-6 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {role === "admin" ? "Operations portal" : "Customer portal"}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Primary navigation">
          {navigation.map((item) => {
            const active = item.href === "/dashboard"
              ? pathname === item.href
              : item.href === "/admin"
                ? pathname.startsWith("/admin")
                : pathname.startsWith(item.href.split("#")[0]);
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-cyan-500/15 text-cyan-200"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-3 px-2 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex h-16 items-center justify-between px-4">
            <Brand />
            <button type="button" onClick={signOut} className="text-sm font-semibold text-slate-600">
              Log out
            </button>
          </div>
          <nav className="flex overflow-x-auto border-t border-slate-100 px-2" aria-label="Mobile navigation">
            {navigation.slice(0, role === "admin" ? 3 : 4).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex min-w-max items-center gap-1.5 px-3 py-3 text-xs font-semibold text-slate-600"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
