"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { toast } from "sonner";

/**
 * Honeypot field name — MUST match REPORT_HONEYPOT_FIELD in lib/report-deal.ts
 * (cross-asserted by scripts/verify-report-endpoint.ts). Never rendered
 * visible; a filled value marks an automated submission.
 */
const HONEYPOT_FIELD = "company";

export function ReportBrokenDeal({
  dealId,
  brandName,
}: {
  dealId: string;
  brandName: string;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append(HONEYPOT_FIELD, "");
      form.append("dealId", dealId);
      const res = await fetch(`/api/deals/${dealId}/report`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (res.ok && data.success) {
        toast.success("Thanks — our team will review this deal.");
      } else if (res.status === 429) {
        toast.error("Too many reports from your IP. Please try again later.");
      } else {
        toast.error("Could not submit the report. Please try again.");
      }
    } catch {
      toast.error("Could not submit the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 border-t border-border pt-4">
      <input
        type="hidden"
        name={HONEYPOT_FIELD}
        value=""
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
      />
      <p className="text-sm font-medium text-foreground">Spotted a problem?</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Broken offer link, expired terms, or wrong details — let us know and
        we&apos;ll review this {brandName} deal.
      </p>
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {submitting ? "Submitting…" : "Report broken deal"}
      </button>
    </form>
  );
}
