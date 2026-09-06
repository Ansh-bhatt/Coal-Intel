"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import ReportStudio from "./components/ReportStudio";

/**
 * Executive studio — Report Studio only.
 *
 * The former "Search & Draft" chat tab, the parliamentary draft entry point
 * and the right-hand PDF reference pane have been retired; report generation
 * keeps working exactly as before (build → generate → export).
 */
export default function ExecutivePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login?portal=executive");
    } else {
      setActivePortal("EXECUTIVE");
    }
  }, [isAuthenticated, router, setActivePortal]);

  useEffect(() => {
    // Defense in depth on top of middleware.ts: executives only.
    if (isAuthenticated && user && user.role !== "EXECUTIVE" && user.role !== "ADMIN") {
      router.replace("/unauthorized");
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || !user || (user.role !== "EXECUTIVE" && user.role !== "ADMIN")) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-accent/10 text-accent">
            <FileText className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Report Studio
            </h1>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
              On-demand executive reports
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <ReportStudio />
        </div>
      </main>
    </div>
  );
}