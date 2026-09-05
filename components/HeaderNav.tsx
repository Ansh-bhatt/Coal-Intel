"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  FileSearch,
  LogOut,
  MessagesSquare,
  UserRound,
  UploadCloud,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import type { PortalMode, UserRole } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: typeof FileSearch;
  portal: PortalMode;
}

/**
 * Role-isolated navigation. Each role sees ONLY the portals it is entitled
 * to — executives never see ingestion controls and vice versa (see
 * Instructions.md §1: strict role-based access).
 */
const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  EXECUTIVE: [
    { label: "Executive Studio", href: "/executive", icon: FileSearch, portal: "EXECUTIVE" },
    { label: "Analytics", href: "/analytics", icon: BarChart3, portal: "ANALYTICS" },
    { label: "Query System", href: "/query-system", icon: MessagesSquare, portal: "QUERY" },
  ],
  SUBSIDIARY: [
    { label: "Ingestion Hub", href: "/ingestion", icon: UploadCloud, portal: "INGESTION" },
  ],
  ADMIN: [
    { label: "Executive Studio", href: "/executive", icon: FileSearch, portal: "EXECUTIVE" },
    { label: "Analytics", href: "/analytics", icon: BarChart3, portal: "ANALYTICS" },
    { label: "Query System", href: "/query-system", icon: MessagesSquare, portal: "QUERY" },
    { label: "Ingestion Hub", href: "/ingestion", icon: UploadCloud, portal: "INGESTION" },
  ],
};

const ROLE_BADGE: Record<UserRole, { label: string; className: string }> = {
  EXECUTIVE: { label: "Executive Access", className: "bg-ink" },
  SUBSIDIARY: { label: "Field Operative", className: "bg-accent" },
  ADMIN: { label: "Administrator", className: "bg-ink" },
};

export default function HeaderNav() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const items = user ? NAV_BY_ROLE[user.role] ?? [] : [];

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
        {/* Branding + role-scoped navigation */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink font-display text-xs font-bold text-white">
              C
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold tracking-tight">
                CIL · CMPDI
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink/50">
                Data Intelligence
              </p>
            </div>
          </Link>

          {items.length > 0 && (
            <nav
              aria-label="Portal navigation"
              className="ml-4 hidden items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 sm:flex"
            >
              {items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] transition-all",
                      active
                        ? item.portal === "INGESTION"
                          ? "bg-accent text-white shadow-sm"
                          : "bg-ink text-white shadow-sm"
                        : "text-ink/60 hover:text-ink",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Active user pill + session controls */}
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white/70 py-1 pl-1 pr-3">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-white",
                  ROLE_BADGE[user.role]?.className ?? "bg-ink",
                )}
              >
                <UserRound className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-medium text-ink">{user.name}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
                  {ROLE_BADGE[user.role]?.label ?? user.role}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink/50 transition hover:border-accent hover:text-accent"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}