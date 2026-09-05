"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import ChatInterface from "./components/ChatInterface";
import PdfSplitViewer from "./components/PdfSplitViewer";
import ParliamentaryDraftModal from "./components/ParliamentaryDraftModal";

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
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 gap-4 px-6 py-4">
        {/* Left pane — Chat */}
        <div className="flex min-w-0 flex-[1.1] flex-col">
          <ChatInterface />
        </div>

        {/* Right pane — PDF Viewer + controls */}
        <div className="flex min-w-0 flex-[1.4] flex-col gap-3">
          <PdfSplitViewer />
          <div className="flex justify-end">
            <ParliamentaryDraftModal />
          </div>
        </div>
      </main>
    </div>
  );
}