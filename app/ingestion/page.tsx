"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import HeaderNav from "@/components/HeaderNav";
import FileDropzone from "./components/FileDropzone";
import MetadataForm from "./components/MetadataForm";
import VerificationGrid from "./components/VerificationGrid";

export default function IngestionPage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  useEffect(() => {
    if (!isAuthenticated) router.replace("/login?portal=subsidiary");
    else setActivePortal("INGESTION");
  }, [isAuthenticated, router, setActivePortal]);

  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <HeaderNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 gap-4 px-6 py-4">
        {/* Left column — FileDropzone + Metadata */}
        <div className="flex min-w-0 w-[400px] shrink-0 flex-col gap-4">
          <FileDropzone />
          <MetadataForm />
        </div>

        {/* Right column — Verification grid */}
        <div className="flex min-w-0 flex-1 flex-col">
          <VerificationGrid />
        </div>
      </main>
    </div>
  );
}