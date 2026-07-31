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

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<CookieConsentValue>(() =>
    readStoredConsent(),
  );

  const accept = useCallback(() => {
    writeConsent("accepted");
    setConsent("accepted");
  }, []);

  const decline = useCallback(() => {
    writeConsent("declined");
    setConsent("declined");
  }, []);

  // Multi-tab sync via storage event
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === "accepted" || e.newValue === "declined") {
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
  const acceptRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (consent !== null) return;
    const root = panelRef.current;
    if (!root) return;

    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

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

    acceptRef.current?.focus();

    const getFocusable = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        decline();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.removeAttribute("data-cookie-banner");
      document.documentElement.style.removeProperty("--cookie-banner-height");
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus();
      }
    };
  }, [consent, decline]);

  // Banner hidden: consent already given or declined
  if (consent !== null) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      // Non-blocking chrome: claim bar and page stay usable while banner is open
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed bottom-0 left-0 right-0 z-[200] border-t border-border/60 bg-card/95 backdrop-blur-md shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300"
    >
      <h2 id="cookie-consent-title" className="sr-only">
        Cookie consent
      </h2>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <p id="cookie-consent-desc" className="text-sm text-muted-foreground">
          We use cookies for basic analytics (via Google Analytics) to understand
          how our site is used. No advertising or tracking cookies. Read our{" "}
          <Link
            href="/privacy"
            className={`underline underline-offset-2 hover:text-foreground transition-colors rounded-sm ${FOCUS_RING}`}
          >
            privacy policy
          </Link>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className={`rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors ${FOCUS_RING}`}
          >
            Decline
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={accept}
            className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors ${FOCUS_RING}`}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
