function toValidDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatDate(date: Date | string | null | undefined) {
  const d = toValidDate(date);
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeDate(date: Date | string | null | undefined) {
  const d = toValidDate(date);
  if (!d) return null;
  const now = new Date();
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Expired";
  if (diffDays === 0) return "Ends today";
  if (diffDays === 1) return "Ends tomorrow";
  if (diffDays <= 7) return `Ends in ${diffDays} days`;
  return `Ends ${formatDate(d)}`;
}

export function discountLabel(
  discountType: string,
  discountValue?: string | null
): string {
  if (discountValue) return discountValue;
  switch (discountType) {
    case "PERCENTAGE":
      return "% Off";
    case "FIXED":
      return "$ Off";
    case "FREE_TIER":
      return "Free";
    case "LIFETIME":
      return "Lifetime";
    default:
      return "Deal";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "APPROVED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900";
    case "PENDING":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900";
    case "REJECTED":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900";
    case "EXPIRED":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}
