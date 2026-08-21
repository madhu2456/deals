"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";

const STORAGE_KEY = "deals_cookie_consent";
const CONSENT_EVENT = "deals-cookie-consent";

export type CookieConsentValue = "accepted" | "declined" | null;

type CookieConsentContextValue = {
  consent: CookieConsentValue;
  accept: () => void;
  decline: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null,
);

declare global {
  interface Window {
    gtag?: (
      command: "consent" | "set" | "config" | "event" | "js",
      ...args: unknown[]
    ) => void;
    // Align with lib/analytics.ts Window.dataLayer declaration
    dataLayer?: Record<string, unknown>[];
  }
}

function readStoredConsent(): CookieConsentValue {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "accepted" || stored === "declined") return stored;
  return null;
}

function writeConsent(value: "accepted" | "declined") {
  localStorage.setItem(STORAGE_KEY, value);
  window.dispatchEvent(
    new CustomEvent(CONSENT_EVENT, { detail: value }),
  );
}

/**
 * Consent Mode v2 update. Ads signals stay denied (site does not use ad cookies);
 * analytics_storage follows the user's explicit choice.
 */
function updateGtagConsent(value: "accepted" | "declined") {
  if (typeof window === "undefined") return;
  const gtag = window.gtag;
  if (typeof gtag !== "function") return;

  if (value === "accepted") {
    gtag("consent", "update", {
      analytics_storage: "granted",
      // No advertising cookies on this site — keep ad signals denied
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
    });
  } else {
    gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
    });
  }
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<CookieConsentValue>(() =>
    readStoredConsent(),
  );

  const accept = useCallback(() => {
    writeConsent("accepted");
    updateGtagConsent("accepted");
    setConsent("accepted");
  }, []);

  const decline = useCallback(() => {
    writeConsent("declined");
    updateGtagConsent("declined");
    setConsent("declined");
  }, []);

  // Apply stored choice on mount (returning visitors) so GTM sees the update
  useEffect(() => {
    const stored = readStoredConsent();
    if (stored === "accepted" || stored === "declined") {
      updateGtagConsent(stored);
    }
  }, []);

  // Multi-tab sync via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "accepted" || e.newValue === "declined") {
        updateGtagConsent(e.newValue);
        setConsent(e.newValue);
      } else if (e.newValue === null) {
        setConsent(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(
    () => ({ consent, accept, decline }),
    [consent, accept, decline],
  );

  return (
    <CookieConsentContext.Provider value={value}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    throw new Error(
      "useCookieConsent must be used within a CookieConsentProvider",
    );
  }
  return ctx;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function CookieConsentBanner() {
  const { consent, accept, decline } = useCookieConsent();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consent !== null) return;
    const root = panelRef.current;
    if (!root) return;

    document.documentElement.setAttribute("data-cookie-banner", "open");

    const setBannerHeight = () => {
      const height = root.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--cookie-banner-height",
        `${height}px`,
      );
    };

    setBannerHeight();
    const rafId = requestAnimationFrame(setBannerHeight);
    const resizeObserver = new ResizeObserver(setBannerHeight);
    resizeObserver.observe(root);

    // Non-modal: Escape declines only when focus is inside the banner (C50).
    // Do not autofocus or wrap Tab (F309) — skip link and main stay first-visit Tab-reachable.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!root.contains(e.target as Node)) return;
      e.preventDefault();
      decline();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.removeAttribute("data-cookie-banner");
      document.documentElement.style.removeProperty("--cookie-banner-height");
    };
  }, [consent, decline]);

  // Banner hidden: consent already given or declined
  if (consent !== null) return null;

  return (
    <div
      ref={panelRef}
      role="region"
      aria-live="polite"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed bottom-0 left-0 right-0 z-[200] border-t border-border/60 bg-card/95 backdrop-blur-md shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300"
    >
      <h2 id="cookie-consent-title" className="sr-only">
        Cookie consent
      </h2>
      <p id="cookie-consent-desc" className="sr-only">
        We use cookies for basic analytics (via Google Analytics) to understand
        how our site is used. No advertising or tracking cookies.
      </p>
      <div className="mx-auto flex h-14 min-h-14 max-h-[72px] w-full max-w-6xl flex-row items-center gap-2 px-3 sm:gap-4 sm:px-6">
        <p
          className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
          aria-hidden="true"
        >
          Cookies for basic analytics. No ads.
        </p>
        <Link
          href="/privacy"
          className={`shrink-0 rounded-sm text-sm font-medium underline underline-offset-2 transition-colors hover:text-foreground ${FOCUS_RING}`}
        >
          Privacy Policy
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={decline}
            className={`min-h-11 rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted ${FOCUS_RING}`}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={accept}
            className={`min-h-11 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${FOCUS_RING}`}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
