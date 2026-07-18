import Link from "next/link";
import { SearchX, PlusCircle, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  showSubmit?: boolean;
  showBrowse?: boolean;
}

export function EmptyState({
  title = "No deals found",
  description = "Try adjusting your search or browse all categories.",
  showSubmit = true,
  showBrowse = true,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-4 py-16 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <SearchX className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {showBrowse && (
          <Button asChild variant="outline" className="gap-2">
            <Link href="/categories">
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              Browse categories
            </Link>
          </Button>
        )}
        {showSubmit && (
          <Button asChild className="gap-2">
            <Link href="/submit">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              Submit a Deal
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
