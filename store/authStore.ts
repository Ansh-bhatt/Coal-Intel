"use client";

import { create } from "zustand";
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
  /** Per-role credential login: tries the backend, falls back to the demo
   *  user when the API is unreachable so the UI stays demoable offline. */
  login: (params: {
    email?: string;
    password?: string;
    role: "EXECUTIVE" | "SUBSIDIARY";
    name?: string;
    subsidiary?: string;
    coalfield?: string;
  }) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

function userFromToken(t: TokenResponse): SessionUser {
  return t.user;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: () => {
    // Restore a session so refreshes keep the user signed in. The JWT itself
    // lives in localStorage (only used by the API client for Authorization
    // headers) — see lib/api.ts.
    try {
      const raw = window.localStorage.getItem("coal_intel_session");
      if (raw) {
        const parsed = JSON.parse(raw) as { user: SessionUser };
        set({ user: parsed.user, isAuthenticated: true });
      }
    } catch {
      /* corrupt session — ignore */
    }
  },

  login: async (params) => {
    const isExecutive = params.role === "EXECUTIVE";
    const email = params.email ?? (isExecutive ? "a.bhattacharya@cil.co.in" : "r.verma@mcl.co.in");
    const password = params.password ?? "Demo@1234";

    try {
      const token = await apiLogin(email, password);
      setAccessToken(token.access_token);
      const user = userFromToken(token);
      window.localStorage.setItem("coal_intel_session", JSON.stringify({ user }));
      set({ user, isAuthenticated: true });
    } catch {
      // Backend unreachable → demo session (demoable offline).
      // Apply the same fallback behaviour symmetrically to both roles.
      const demo: SessionUser = isExecutive
        ? { name: params.name || "A. Bhattacharya", role: "EXECUTIVE", email }
        : {
            name: params.name || "R. Verma",
            role: "SUBSIDIARY",
            subsidiary: params.subsidiary || "Mahanadi Coalfields Ltd",
            coalfield: params.coalfield || "Talcher Coalfield",
            email,
          };
      window.localStorage.setItem("coal_intel_session", JSON.stringify({ user: demo }));
      set({ user: demo, isAuthenticated: true });
    }
  },

  logout: () => {
    clearAccessToken();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("coal_intel_session");
    }
    set({ user: null, isAuthenticated: false });
  },
}));
// Hydrate session synchronously on client-side module load so page refreshes
// restore the session without a loading flash.
if (typeof window !== "undefined") {
  try {
    const raw = window.localStorage.getItem("coal_intel_session");
    if (raw) {
      const parsed = JSON.parse(raw) as { user: SessionUser };
      useAuthStore.setState({ user: parsed.user, isAuthenticated: true });
    }
  } catch {
    /* corrupt session — ignore */
  }
}
