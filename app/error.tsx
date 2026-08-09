"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * App-level error boundary UI (Next.js app/error.tsx).
 * Matches not-found styling; provides recovery without full page chrome
 * (Header/Footer are outside the segment error boundary in root layout).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // digest is safe to log; avoid dumping message content that may include PII
    console.error("[app-error]", error.digest ?? error.name);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center"
    >
      <p className="text-sm font-semibold text-primary">Something went wrong</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        We hit an unexpected error
      </h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        You can try again, or head back to the home page and continue browsing
        deals. If this keeps happening, contact us.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/deals">Browse deals</Link>
        </Button>
      </div>
    </main>
  );
}
