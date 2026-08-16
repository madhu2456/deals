import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { DealGrid } from "../components/DealGrid";
import { EmptyState } from "../components/EmptyState";
import {
  countApprovedDeals,
  getApprovedDeals,
  getApprovedDealsPaginated,
  getCategories,
  PAGINATION_THRESHOLD,
  type PublicDeal,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { itemListSchema, JsonLd, webPageSchema } from "@/lib/seo/json-ld";
import { absoluteUrl, defaultOgImage, defaultOgImages } from "@/lib/site";

export const dynamic = "force-dynamic";

interface DealsPageProps {
  searchParams: Promise<{
    q?: string;
    category?: string;
    featured?: string;
    cursor?: string;
  }>;
}

/** /deals URL preserving the active filters (pagination hrefs). */
function dealsPath({
  search,
  categorySlug,
  featuredOnly,
  cursor,
}: {
  search: string;
  categorySlug: string;
  featuredOnly: boolean;
  cursor?: string;
}): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (categorySlug) params.set("category", categorySlug);
  if (featuredOnly) params.set("featured", "1");
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/deals?${query}` : "/deals";
}

/**
 * Canonical /deals URL: active filters preserved, cursor never included, so
 * every page — page 1, minted cursor pages, garbage cursor URLs — resolves to
 * the same bare filtered URL. Deeper pages stay crawlable through the
 * rel=next links instead of self-canonicalizing.
 */
function canonicalDealsPath({
  search,
  categorySlug,
  featuredOnly,
}: {
  search: string;
  categorySlug: string;
  featuredOnly: boolean;
}): string {
  return dealsPath({ search, categorySlug, featuredOnly });
}

export async function generateMetadata({
  searchParams,
}: DealsPageProps): Promise<Metadata> {
  const params = await searchParams;
  // Bare /deals + active filters (q/category/featured), NEVER the cursor:
  // minted and garbage cursor URLs all consolidate to the canonical, so they
  // cannot become separately indexable duplicate pages.
  const canonical = canonicalDealsPath({
    search: params.q || "",
    categorySlug: params.category || "",
    featuredOnly: params.featured === "1",
  });

  return {
    title: "Browse Verified Software Deals",
    description:
      "Filter current software and SaaS deals. Validity can change; each page states how to claim.",
    alternates: { canonical },
    openGraph: {
      title: "Browse Verified Software Deals",
      description:
        "Filter current software and SaaS deals. Validity can change; each page states how to claim.",
      url: absoluteUrl(canonical),
      images: defaultOgImages(),
    },
    twitter: {
      card: "summary_large_image",
      title: "Browse Verified Software Deals",
      description:
        "Filter current software and SaaS deals. Validity can change; each page states how to claim.",
      images: [defaultOgImage()],
    },
  };
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const params = await searchParams;
  const search = params.q || "";
  const categorySlug = params.category || "";
  const featuredOnly = params.featured === "1";
  const cursorParam = params.cursor || "";
  // Same canonical the metadata uses: bare /deals + filters, no cursor.
  const canonicalPath = canonicalDealsPath({ search, categorySlug, featuredOnly });

  const [totalDealCount, categories] = await Promise.all([
    countApprovedDeals(),
    getCategories(),
  ]);

  // Scale gate: at or below the threshold the page renders exactly as before
  // (all deals, no pagination UI); above it we keyset-paginate.
  const paginate = totalDealCount > PAGINATION_THRESHOLD;

  let deals: PublicDeal[];
  let nextCursor: string | null = null;
  let hasPrevious = false;

  if (paginate) {
    const page = await getApprovedDealsPaginated({
      cursor: cursorParam || undefined,
      search,
      categorySlug,
      featuredOnly,
    });
    deals = page.deals;
    nextCursor = page.hasNext ? page.nextCursor : null;
    hasPrevious = page.hasCursor;
  } else {
    deals = await getApprovedDeals({ search, categorySlug, featuredOnly });
  }

  const activeCategories = categories.filter((c) => c._count.deals > 0);

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
        : "All verified deals";

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: pageTitle,
          description:
            "Filter current software and SaaS deals. Validity can change; each page states how to claim.",
          path: canonicalPath,
          type: "CollectionPage",
        })}
      />
      {deals.length > 0 && (
        <JsonLd
          data={itemListSchema({
            name: pageTitle,
            description: `${deals.length} verified deals matching your filters.`,
            path: canonicalPath,
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
            {deals.length > 0 && (
              <p role="status" aria-live="polite" className="mt-2 text-muted-foreground">
                <span className="font-medium tabular-nums text-foreground">{deals.length}</span>{" "}
                {deals.length === 1 ? "deal" : "deals"} found
                {hasFilters ? " with your filters" : ""}
              </p>
            )}

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

              {activeCategories.map((category) => {
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
            <>
              <DealGrid deals={deals} />
              {(nextCursor || hasPrevious) && (
                <nav
                  aria-label="Deals pagination"
                  className="mt-10 flex items-center justify-center gap-4"
                >
                  {hasPrevious && (
                    <Link
                      rel="prev"
                      href={dealsPath({ search, categorySlug, featuredOnly })}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Back to first page
                    </Link>
                  )}
                  {nextCursor && (
                    <Link
                      rel="next"
                      href={dealsPath({
                        search,
                        categorySlug,
                        featuredOnly,
                        cursor: nextCursor,
                      })}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Next page
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </nav>
              )}
            </>
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
