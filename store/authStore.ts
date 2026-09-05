"use client";

import { create } from "zustand";
import { ApiError, isNetworkError } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import {
  clearAccessToken,
  login as apiLogin,
  setAccessToken,
  type TokenResponse,
} from "@/lib/api";

interface AuthState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  /** Strict backend-first login. Credential rejections (401/403/400) are
   *  surfaced to the caller — only network outages fall back to the demo
   *  session so the UI stays demoable offline. Resolves to `true` when the
   *  session was verified by the backend, `false` for a demo fallback. */
  login: (params: {
    email: string;
    password: string;
    role: "EXECUTIVE" | "SUBSIDIARY";
    subsidiary?: string;
    coalfield?: string;
  }) => Promise<boolean>;
  logout: () => void;
  hydrate: () => void;
}

export const SESSION_STORAGE_KEY = "coal_intel_session";
const ROLE_COOKIE = "coal_intel_role";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function writeSessionCookie(user: SessionUser) {
  if (typeof document === "undefined") return;
  const secure = document.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ROLE_COOKIE}=${encodeURIComponent(user.role)}; Path=/; ` +
    `Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function clearSessionCookies() {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function persist(user: SessionUser) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ user }));
  writeSessionCookie(user);
  useAuthStore.setState({ user, isAuthenticated: true });
}

function demoFallbackUser(params: {
  role: "EXECUTIVE" | "SUBSIDIARY";
  subsidiary?: string;
  coalfield?: string;
}): SessionUser {
  return params.role === "EXECUTIVE"
    ? { name: "A. Bhattacharya", role: "EXECUTIVE", email: "a.bhattacharya@cil.co.in" }
    : {
        name: "R. Verma",
        role: "SUBSIDIARY",
        subsidiary: params.subsidiary || "Mahanadi Coalfields Ltd",
        coalfield: params.coalfield || "Talcher Coalfield",
        email: "r.verma@mcl.co.in",
      };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: () => {
    // Restore a session so refreshes keep the user signed in. The JWT itself
    // lives in localStorage (only used by the API client for Authorization
    // headers) — see lib/api.ts.
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { user: SessionUser };
        set({ user: parsed.user, isAuthenticated: true });
        writeSessionCookie(parsed.user); // keep the middleware cookie in sync
      }
    } catch {
      /* corrupt session — ignore */
    }
  },

  login: async (params) => {
    const email = params.email.trim();
    const password = params.password;

    try {
      const token: TokenResponse = await apiLogin(email, password);
      setAccessToken(token.access_token);
      persist(token.user);
      return true;
    } catch (err) {
      // Credential rejections must surface — never swap in a demo identity.
      if (err instanceof ApiError && !isNetworkError(err)) throw err;
      // Network unreachable → demo session (demoable offline), role-scoped.
      persist(demoFallbackUser(params));
      return false;
    }
  },

  logout: () => {
    clearAccessToken();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    clearSessionCookies();
    set({ user: null, isAuthenticated: false });
  },
}));

// Hydrate session synchronously on client-side module load so page refreshes
// restore the session without a loading flash.
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { user: SessionUser };
      useAuthStore.setState({ user: parsed.user, isAuthenticated: true });
      writeSessionCookie(parsed.user);
    }
  } catch {
    /* corrupt session — ignore */
  }
}