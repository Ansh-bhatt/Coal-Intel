"use client";

import { create } from "zustand";
import type { SessionUser } from "@/lib/types";

interface AuthState {
  user: SessionUser | null;
  isAuthenticated: boolean;
  login: (user: SessionUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
