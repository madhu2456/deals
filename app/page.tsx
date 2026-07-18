import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { CategoryCard } from "./components/CategoryCard";
import { DealGrid } from "./components/DealGrid";
import { EmptyState } from "./components/EmptyState";
import { FaqSection } from "./components/FaqSection";
import { getCategories, getFeaturedDeals, getLatestDeals } from "@/lib/data";
import {
  faqSchema,
  HOME_FAQS,
  itemListSchema,
  JsonLd,
  webPageSchema,
} from "@/lib/seo/json-ld";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

// Runtime data from SQLite — do not prerender at Docker build time
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: `${SITE_NAME} — Verified Deals, Coupons & Discounts for Everyone`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} — Verified Deals, Coupons & Discounts`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl("/"),
    type: "website",
  },
};

export default async function HomePage() {
  const [categories, featuredDeals, latestDeals] = await Promise.all([
    getCategories(),
    getFeaturedDeals(4),
    getLatestDeals(8),
  ]);

  const totalDeals = categories.reduce(
    (sum, category) => sum + category._count.deals,
    0
  );

  const listItems = latestDeals.map((d) => ({
    name: d.title,
    path: `/deals/${d.slug}`,
    description: d.shortDescription || d.description,
    image: d.logoUrl,
  }));

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: `${SITE_NAME} — Verified Deals, Coupons & Discounts`,
          description: SITE_DESCRIPTION,
          path: "/",
        })}
      />
      <JsonLd data={faqSchema(HOME_FAQS)} />
      {listItems.length > 0 && (
        <JsonLd
          data={itemListSchema({
            name: "Latest verified deals",
            description: "Recently approved discounts and coupon offers.",
            path: "/",
            items: listItems,
          })}
        />
      )}

      <Header />

      <main id="main-content" className="flex-1">
        <Hero dealCount={totalDeals} />

        {/* AEO answer-first intro — extractable definition block */}
        <section
          className="border-b border-border bg-card/40 px-4 py-10 sm:px-6 lg:px-8"
          aria-labelledby="what-is-deals"
        >
          <div className="mx-auto max-w-3xl">
            <h2
              id="what-is-deals"
              className="text-balance text-xl font-bold tracking-tight text-foreground sm:text-2xl"
            >
              What is Deals?
            </h2>
            <p className="mt-3 text-pretty text-base leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">Deals</strong> is
              a free, curated directory of verified discounts, coupon codes, and
              exclusive offers on software, SaaS tools, cloud services, design
              apps, courses, and everyday products. Every public listing is
              reviewed before it goes live — so you can search, filter by
              category, and claim offers with confidence.
            </p>
            <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
              <li>Browse {totalDeals}+ verified offers across {categories.length} categories</li>
              <li>Copy coupon codes and open merchant links in one click</li>
              <li>Submit deals you find — we moderate before publishing</li>
            </ul>
          </div>
        </section>

        <section
          className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
          aria-labelledby="categories-heading"
        >
          <div className="mb-8 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="categories-heading"
                className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Browse deals by category
              </h2>
              <p className="mt-1 text-muted-foreground">
                From AI tools to travel — find discounts for what you actually use.
              </p>
            </div>
            <Button asChild variant="ghost" className="hidden shrink-0 gap-1 sm:inline-flex">
              <Link href="/categories">
                View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.slice(0, 8).map((category) => (
              <CategoryCard
                key={category.id}
                name={category.name}
                slug={category.slug}
                description={category.description}
                icon={category.icon}
                color={category.color}
                dealCount={category._count.deals}
              />
            ))}
          </div>
        </section>

        {featuredDeals.length > 0 && (
          <section
            className="border-y border-border bg-card/30 px-4 py-14 sm:px-6 lg:px-8"
            aria-labelledby="featured-heading"
          >
            <div className="mx-auto max-w-7xl">
              <div className="mb-8 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    id="featured-heading"
                    className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
                  >
                    Featured deals
                  </h2>
                  <p className="mt-1 text-muted-foreground">
                    Hand-picked offers worth checking out first.
                  </p>
                </div>
                <Button asChild variant="ghost" className="hidden shrink-0 gap-1 sm:inline-flex">
                  <Link href="/deals?featured=1">
                    View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
              <DealGrid deals={featuredDeals} />
            </div>
          </section>
        )}

        <section
          className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
          aria-labelledby="latest-heading"
        >
          <div className="mb-8 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="latest-heading"
                className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
              >
                Latest verified deals
              </h2>
              <p className="mt-1 text-muted-foreground">
                Recently reviewed offers added to the directory.
              </p>
            </div>
            <Button asChild variant="ghost" className="hidden shrink-0 gap-1 sm:inline-flex">
              <Link href="/deals">
                View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {latestDeals.length > 0 ? (
            <DealGrid deals={latestDeals} />
          ) : (
            <EmptyState
              title="No deals published yet"
              description="Be the first to share a verified discount with the community."
            />
          )}
        </section>

        <div className="border-t border-border bg-card/30">
          <FaqSection />
        </div>

        <section
          className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"
          aria-labelledby="submit-cta-heading"
        >
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground shadow-lg sm:px-12 sm:py-16">
            <div className="relative z-10 flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2
                  id="submit-cta-heading"
                  className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
                >
                  Know a great deal?
                </h2>
                <p className="mt-2 max-w-lg text-pretty text-primary-foreground/90">
                  Share a discount you found. We review every submission before it goes live.
                </p>
              </div>
              <Button asChild size="lg" variant="secondary" className="min-h-11 shrink-0">
                <Link href="/submit">Submit a Deal</Link>
              </Button>
            </div>
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl"
              aria-hidden="true"
            />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
