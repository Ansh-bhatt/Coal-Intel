"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import QuerySystemChat from "./components/QuerySystemChat";
import SourcePdfPane from "./components/SourcePdfPane";

/**
 * Standalone RAG query system — independent of the executive studio.
 * parliamentary/administrative users ask high-priority questions and get
 * context-grounded, citation-backed streaming answers next to the source PDF.
 */
export default function QuerySystemPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  useEffect(() => {
    setActivePortal("QUERY");
  }, [setActivePortal]);

  useEffect(() => {
    // Defense in depth on top of middleware.ts.
    if (!isAuthenticated) {
      router.replace("/login?portal=executive");
    } else if (user && user.role !== "EXECUTIVE" && user.role !== "ADMIN") {
      router.replace("/unauthorized");
    }
  }, [isAuthenticated, user, router]);

  if (!isAuthenticated || !user || (user.role !== "EXECUTIVE" && user.role !== "ADMIN")) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-accent/10 text-accent">
            <MessagesSquare className="h-4.5 w-4.5" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Query System
            </h1>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
              Standalone RAG assistant · context-filtered · source-verified
            </p>
          </div>
        </div>

        <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,34%)]">
          <QuerySystemChat />
          <SourcePdfPane />
        </div>
      </main>
    </div>
  );
}