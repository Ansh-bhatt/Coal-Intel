"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, FileSearch, LogOut, UserRound, UploadCloud } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import { cn } from "@/lib/utils";
import type { PortalMode } from "@/lib/types";

/**
 * Shared top navigation — CIL/CMPDI enterprise branding, active user pill,
 * and the global portal mode toggle (Dual-Portal Shell Switch Pattern).
 */
export default function HeaderNav() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const activePortal = usePortalStore((s) => s.activePortal);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  const togglePortal = (mode: PortalMode) => {
    if (mode === activePortal) return;
    setActivePortal(mode);
    const path = mode === "EXECUTIVE" ? "/executive" : mode === "INGESTION" ? "/ingestion" : "/analytics";
    router.push(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
        {/* Branding */}
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

          {/* Portal mode toggle */}
          <div className="ml-4 hidden items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 sm:flex">
            <button
              onClick={() => togglePortal("EXECUTIVE")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] transition-all",
                activePortal === "EXECUTIVE"
                  ? "bg-ink text-white shadow-sm"
                  : "text-ink/60 hover:text-ink",
              )}
            >
              <FileSearch className="h-3.5 w-3.5" />
              Executive Studio
            </button>
            <button
              onClick={() => togglePortal("INGESTION")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] transition-all",
                activePortal === "INGESTION"
                  ? "bg-accent text-white shadow-sm"
                  : "text-ink/60 hover:text-ink",
              )}
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Ingestion Hub
            </button>
            <button
              onClick={() => togglePortal("ANALYTICS")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] transition-all",
                activePortal === "ANALYTICS"
                  ? "bg-ink text-white shadow-sm"
                  : "text-ink/60 hover:text-ink",
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </button>
          </div>
        </div>

        {/* Active user pill + session controls */}
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white/70 py-1 pl-1 pr-3">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-white",
                  user.role === "EXECUTIVE" ? "bg-ink" : "bg-accent",
                )}
              >
                <UserRound className="h-3.5 w-3.5" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-medium text-ink">{user.name}</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-ink/50">
                  {user.role === "EXECUTIVE" ? "Executive Access" : "Field Operative"}
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
