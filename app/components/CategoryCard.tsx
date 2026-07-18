import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CategoryCardProps {
  name: string;
  slug: string;
  description?: string | null;
  icon: string;
  color: string;
  dealCount: number;
}

export function CategoryCard({
  name,
  slug,
  description,
  icon,
  color,
  dealCount,
}: CategoryCardProps) {
  const Icon = getIcon(icon);

  return (
    <Link
      href={`/categories/${slug}`}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-5",
        "surface-elevated transition-[border-color,box-shadow,transform] duration-200",
        "hover:border-primary/35 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "active:scale-[0.99]"
      )}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition-opacity duration-200 group-hover:opacity-25"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        <ArrowUpRight
          className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </div>

      <div className="min-w-0">
        <h3 className="break-words font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">
          {name}
        </h3>
        {description && (
          <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      <div className="mt-auto pt-1 text-xs font-medium tabular-nums text-muted-foreground">
        {dealCount} {dealCount === 1 ? "deal" : "deals"}
      </div>
    </Link>
  );
}
