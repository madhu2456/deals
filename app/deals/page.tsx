import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DealGrid } from "../components/DealGrid";
import { EmptyState } from "../components/EmptyState";
import { getApprovedDeals, getCategories } from "@/lib/data";
import { cn } from "@/lib/utils";
import { itemListSchema, JsonLd, webPageSchema } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse Verified Deals & Coupon Codes",
  description:
    "Search and filter verified deals, coupon codes, and exclusive discounts on software, SaaS tools, and products. Updated regularly.",
  alternates: { canonical: "/deals" },
  openGraph: {
    title: "Browse Verified Deals & Coupon Codes",
    description:
      "Search and filter verified deals, coupon codes, and exclusive discounts.",
    url: absoluteUrl("/deals"),
  },
};

interface DealsPageProps {
  searchParams: Promise<{ q?: string; category?: string; featured?: string }>;
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const params = await searchParams;
  const search = params.q || "";
  const categorySlug = params.category || "";
  const featuredOnly = params.featured === "1";

  const [deals, categories] = await Promise.all([
    getApprovedDeals({
      search,
      categorySlug,
      featuredOnly,
    }),
    getCategories(),
  ]);

  const activeCategory = categories.find((c) => c.slug === categorySlug);
  const hasFilters = Boolean(search || categorySlug || featuredOnly);

  const clearHref = "/deals";
  const featuredHref = categorySlug
    ? `/deals?category=${categorySlug}&featured=1`
    : "/deals?featured=1";
  const allHref = categorySlug ? `/deals?category=${categorySlug}` : "/deals";

  const pageTitle = featuredOnly
    ? "Featured Deals"
    : activeCategory
      ? `${activeCategory.name} Deals`
      : search
        ? `Results for “${search}”`
        : "All Deals";

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: pageTitle,
          description:
            "Search and filter verified deals, coupon codes, and exclusive discounts.",
          path: "/deals",
          type: "CollectionPage",
        })}
      />
      {deals.length > 0 && (
        <JsonLd
          data={itemListSchema({
            name: pageTitle,
            description: `${deals.length} verified deals matching your filters.`,
            path: "/deals",
            items: deals.slice(0, 50).map((d) => ({
              name: d.title,
              path: `/deals/${d.slug}`,
              description: d.shortDescription || d.description,
            })),
          })}
        />
      )}

      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {pageTitle}
            </h1>
            <p className="mt-2 text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{deals.length}</span>{" "}
              {deals.length === 1 ? "deal" : "deals"} found
              {hasFilters ? " with your filters" : ""}
            </p>

            <form
              action="/deals"
              role="search"
              className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row"
            >
              <div className="relative min-w-0 flex-1">
                <label htmlFor="deals-search" className="sr-only">
                  Search deals, brands, or coupon codes
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="deals-search"
                  name="q"
                  defaultValue={search}
                  placeholder="Search deals, brands, or coupon codes…"
                  className="h-11 pl-9"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
              {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
              {featuredOnly && <input type="hidden" name="featured" value="1" />}
              <Button type="submit" className="h-11 min-h-11 gap-2">
                <Search className="h-4 w-4" aria-hidden="true" />
                Search
              </Button>
            </form>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                <span>Filter</span>
              </div>

              <Link
                href={featuredOnly ? allHref : featuredHref}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge
                  variant={featuredOnly ? "default" : "outline"}
                  className={cn(
                    "min-h-8 gap-1 rounded-full px-3 py-1.5",
                    !featuredOnly && "hover:bg-muted"
                  )}
                >
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Featured
                </Badge>
              </Link>

              <Link
                href={featuredOnly ? "/deals?featured=1" : "/deals"}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge
                  variant={!categorySlug ? "default" : "outline"}
                  className={cn(
                    "min-h-8 rounded-full px-3 py-1.5",
                    categorySlug && "hover:bg-muted"
                  )}
                >
                  All
                </Badge>
              </Link>

              {categories.map((category) => {
                const href = featuredOnly
                  ? `/deals?category=${category.slug}&featured=1`
                  : `/deals?category=${category.slug}`;
                const active = categorySlug === category.slug;
                return (
                  <Link
                    key={category.slug}
                    href={href}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Badge
                      variant={active ? "default" : "outline"}
                      className={cn(
                        "min-h-8 max-w-[12rem] rounded-full px-3 py-1.5",
                        !active && "hover:bg-muted"
                      )}
                    >
                      <span className="truncate">{category.name}</span>
                    </Badge>
                  </Link>
                );
              })}
            </div>

            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={clearHref}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Clear filters
                </Link>
              </div>
            )}
          </div>

          {deals.length > 0 ? (
            <DealGrid deals={deals} />
          ) : (
            <EmptyState
              title="No deals found"
              description="Try a different search term, clear filters, or browse another category."
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
