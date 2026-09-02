"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Fingerprint,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import {
  COALFIELD_OPTIONS,
  MOCK_EXECUTIVE_USER,
  MOCK_SUBSIDIARY_USER,
  SUBSIDIARY_OPTIONS,
} from "@/lib/mockData";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

type Role = UserRole;

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("portal") === "subsidiary" ? "SUBSIDIARY" : "EXECUTIVE";

  const [role, setRole] = useState<Role>(initial);
  const [name, setName] = useState("");
  const [subsidiary, setSubsidiary] = useState(SUBSIDIARY_OPTIONS[6]);
  const [coalfield, setCoalfield] = useState(COALFIELD_OPTIONS[0]);
  const [submitting, setSubmitting] = useState(false);

  const login = useAuthStore((s) => s.login);
  const setActivePortal = usePortalStore((s) => s.setActivePortal);

  const isExecutive = role === "EXECUTIVE";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulated federated/credential authentication.
    setTimeout(() => {
      if (isExecutive) {
        login({ ...MOCK_EXECUTIVE_USER, name: name || MOCK_EXECUTIVE_USER.name });
        setActivePortal("EXECUTIVE");
        router.push("/executive");
      } else {
        login({
          ...MOCK_SUBSIDIARY_USER,
          name: name || MOCK_SUBSIDIARY_USER.name,
          subsidiary,
          coalfield,
        });
        setActivePortal("INGESTION");
        router.push("/ingestion");
      }
    }, 650);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm text-ink/60 hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
          <span className="engine-tag">AUTH · SECURE GATEWAY</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <div className="animate-fade-in-up">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Portal sign-in
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              Select your access model to continue into the CIL data workspace.
            </p>
          </div>

          {/* Role selector */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole("EXECUTIVE")}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                isExecutive
                  ? "border-ink bg-ink text-white shadow-card-lift"
                  : "border-black/10 bg-white/60 text-ink/70 hover:border-black/30",
              )}
            >
              <Fingerprint className="h-5 w-5" />
              <span className="font-display text-sm font-semibold">
                Executive Access
              </span>
              <span className={cn("text-[11px]", isExecutive ? "text-white/70" : "text-ink/50")}>
                Search Studio · SSO
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRole("SUBSIDIARY")}
              className={cn(
                "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-all",
                !isExecutive
                  ? "border-accent bg-accent text-white shadow-card-lift"
                  : "border-black/10 bg-white/60 text-ink/70 hover:border-black/30",
              )}
            >
              <Building2 className="h-5 w-5" />
              <span className="font-display text-sm font-semibold">
                Field Operative
              </span>
              <span className={cn("text-[11px]", !isExecutive ? "text-white/80" : "text-ink/50")}>
                Ingestion Hub
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="card-editorial space-y-4 p-6">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
                Operative name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isExecutive ? "e.g. A. Bhattacharya" : "e.g. R. Verma"}
                className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/30"
              />
            </label>

            {!isExecutive && (
              <>
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
                    Subsidiary scope
                  </span>
                  <select
                    value={subsidiary}
                    onChange={(e) => setSubsidiary(e.target.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/30"
                  >
                    {SUBSIDIARY_OPTIONS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
                    Coalfield scope
                  </span>
                  <select
                    value={coalfield}
                    onChange={(e) => setCoalfield(e.target.value)}
                    className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-ink focus:ring-2 focus:ring-accent/30"
                  >
                    {COALFIELD_OPTIONS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <button type="submit" disabled={submitting} className="btn-pill w-full">
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Authenticating…
                </>
              ) : (
                <>
                  {isExecutive ? "Continue with Executive SSO" : "Sign in to Ingestion Hub"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink/50">
              <UserRound className="h-3.5 w-3.5" />
              Demo build — authentication is simulated client-side.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginInner />
    </Suspense>
  );
}
