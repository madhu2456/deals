"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

declare global {
  interface Window {
    turnstile?: {
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
      render: (
        el: string | HTMLElement,
        options: Record<string, unknown>
      ) => string;
    };
  }
}

export function LoginForm({
  action,
  twoFactorEnabled,
  turnstileSiteKey,
}: {
  action: (formData: FormData) => Promise<{ success: boolean; error?: string } | void>;
  /** F021: false ⇒ this form renders EXACTLY as pre-F021 (no extra fields). */
  twoFactorEnabled?: boolean;
  /** Public site key only — never the secret. Empty ⇒ widget omitted. */
  turnstileSiteKey?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const turnstileHostRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);

  // Mirror of SubmitDealForm's explicit-render widget lifecycle (F-DEAL-003):
  // render when the script is ready, remove on unmount.
  useEffect(() => {
    if (!turnstileSiteKey || !turnstileHostRef.current) return;

    const tryRender = () => {
      if (!window.turnstile || !turnstileHostRef.current) return;
      if (turnstileWidgetIdRef.current) return;
      turnstileWidgetIdRef.current = window.turnstile.render(
        turnstileHostRef.current,
        {
          sitekey: turnstileSiteKey,
          theme: "auto",
          // Response field name matches server lookup
          "response-field-name": "cf-turnstile-response",
        }
      );
    };

    tryRender();
    // Script may load after mount
    const id = window.setInterval(tryRender, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 15_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
      if (turnstileWidgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(turnstileWidgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        turnstileWidgetIdRef.current = null;
      }
    };
  }, [turnstileSiteKey]);

  function resetTurnstile() {
    if (turnstileWidgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await action(formData);
      if (result && !result.success) {
        setError(result.error || "Login failed");
        resetTurnstile();
      }
    } catch (err) {
      // Successful login redirects via next/navigation — rethrow so Next can navigate
      if (isNextRedirectError(err)) throw err;
      setError("Login failed. Please try again.");
      resetTurnstile();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {twoFactorEnabled && (
        <div className="space-y-2">
          <Label htmlFor="totpCode">2FA code</Label>
          <Input
            id="totpCode"
            name="totpCode"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            placeholder="6-digit code or recovery code"
            className="tracking-widest"
            required
          />
        </div>
      )}
      {twoFactorEnabled && turnstileSiteKey ? (
        <div className="space-y-2">
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
          />
          <div
            ref={turnstileHostRef}
            className="cf-turnstile min-h-[65px]"
            data-sitekey={turnstileSiteKey}
          />
          <p className="text-xs text-muted-foreground">
            Protected by Cloudflare Turnstile.
          </p>
        </div>
      ) : null}
      {/* WCAG AA: text-destructive (#dc2626) on bg-destructive/10 over card white is
          4.13:1 (light) and 3.89:1 (dark) — text-red-700/dark:text-red-300 restore ≥4.5:1
          (5.54:1 / 7.71:1) on the composited backgrounds. */}
      {error && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
