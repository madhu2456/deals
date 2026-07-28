"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

const STORAGE_KEY = "deals_cookie_consent";

export function useCookieConsent() {
  const [consent, setConsent] = useState<"accepted" | "declined" | null>(
    () => {
      if (typeof window === "undefined") return null;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "accepted" || stored === "declined") return stored;
      return null;
    },
  );

  const accept = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setConsent("accepted");
  }, []);

  const decline = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "declined");
    setConsent("declined");
  }, []);

  return { consent, accept, decline };
}

export default function CookieConsentBanner() {
  const { consent, accept, decline } = useCookieConsent();

  // Banner hidden: consent already given or declined
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[200] border-t border-border/60 bg-card/95 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom duration-300"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <p className="text-sm text-muted-foreground">
          We use cookies for basic analytics (via Google Analytics) to understand how our site is used. No advertising or tracking cookies. Read our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
