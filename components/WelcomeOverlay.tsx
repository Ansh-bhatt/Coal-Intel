"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "coal_intel_welcome_seen";
const VISIBLE_MS = 2600;
const FADE_MS = 600;

/**
 * Full-screen initialization overlay shown once per browser session.
 * Rendered from the root layout; adapts the slate/amber welcome spec to the
 * app's ink/canvas/accent design tokens. Honors prefers-reduced-motion via
 * globals.css.
 */
export function WelcomeOverlay() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* storage unavailable (private mode) — still show once per mount */
    }
    setVisible(true);
    const fadeTimer = window.setTimeout(() => setFading(true), VISIBLE_MS);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    }, VISIBLE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-ink transition-opacity duration-[600ms] ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="px-6 text-center">
        <p className="welcome-kicker font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
          Coal-Intel
        </p>
        <h1 className="welcome-title mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-canvas sm:text-5xl">
          Welcome to the
          <br />
          intelligence desk
        </h1>
        <p className="welcome-sub mx-auto mt-5 max-w-md text-sm leading-relaxed text-canvas/60">
          Initializing conversational document intelligence for the coal
          sector — search, cite, draft and analyze.
        </p>
        <div className="welcome-line mx-auto mt-9 h-px w-24 bg-accent/70" />
      </div>
    </div>
  );
}
