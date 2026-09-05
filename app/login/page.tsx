"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Lock, Mail } from "lucide-react";
import { isNetworkError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

type LoginRole = "EXECUTIVE" | "SUBSIDIARY";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const role: LoginRole =
    searchParams.get("portal") === "subsidiary" ? "SUBSIDIARY" : "EXECUTIVE";

  useEffect(() => {
    // Already signed in with the matching role -> skip the form entirely.
    if (isAuthenticated && user) {
      if (role === "EXECUTIVE" && user.role === "EXECUTIVE") {
        router.replace("/executive");
      } else if (role === "SUBSIDIARY" && user.role === "SUBSIDIARY") {
        router.replace("/ingestion");
      }
    }
  }, [isAuthenticated, user, role, router]);

  const isExecutive = role === "EXECUTIVE";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both your email and password.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    try {
      const verified = await login({
        email: trimmedEmail,
        password,
        role,
        subsidiary: isExecutive ? undefined : "Mahanadi Coalfields Ltd",
        coalfield: isExecutive ? undefined : "Talcher Coalfield",
      });

      if (role === "EXECUTIVE") {
        router.replace("/executive");
      } else {
        router.replace("/ingestion");
      }
      if (!verified) {
        // Demo fallback ran because the backend is unreachable.
        setError(
          "Backend unreachable — signed in with a local demo session. Start the API server for verified access.",
        );
      }
    } catch (err) {
      if (isNetworkError(err)) {
        setError("Cannot reach the authentication server. Check your connection.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6 py-14">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(217,119,6,0.08),transparent)]" />
      <div className="relative w-full max-w-md animate-fade-in-up">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          Back to home
        </Link>

        <div className="card-editorial p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/50">
            {isExecutive ? "Portal 01 — Restricted" : "Portal 02 — Subsidiary"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            {isExecutive ? "Executive Studio" : "Ingestion Hub"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            {isExecutive
              ? "Sign in with your official credentials to access parliamentary search and drafting."
              : "Sign in with your subsidiary credentials to upload and verify documents."}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-sm leading-relaxed text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink/60"
              >
                Official email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@cmpdi.co.in"
                  className="w-full rounded-lg border border-black/15 bg-white/80 py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.18em] text-ink/60"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-black/15 bg-white/80 py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-pill w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Verifying credentials…" : "Sign in"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <p className="mt-6 border-t border-black/10 pt-4 text-center text-xs leading-relaxed text-ink/50">
            {isExecutive
              ? "Access is restricted to Coal India executive accounts."
              : "Access is restricted to registered subsidiary personnel."}
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink/40">
            Loading…
          </p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
