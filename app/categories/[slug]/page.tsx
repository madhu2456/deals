import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { DealGrid } from "../../components/DealGrid";
import { EmptyState } from "../../components/EmptyState";
import { buildCategoryIntro } from "@/lib/category-intro";
import {
  SECURITY_AND_PRIVACY_SEO,
  SECURITY_AND_PRIVACY_SLUG,
} from "@/lib/categories";
import {
  countApprovedDealsInCategory,
  getCategoryBySlug,
  getApprovedDeals,
  getCategories,
  MIN_CATEGORY_DEALS_FOR_INDEX,
} from "@/lib/data";
import { iconMap } from "@/lib/icons";
import { contrastText } from "@/lib/contrast";
import {
  breadcrumbSchema,
  itemListSchema,
  JsonLd,
  webPageSchema,
} from "@/lib/seo/json-ld";
import { absoluteUrl, defaultOgImage, defaultOgImages } from "@/lib/site";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) {
    return { title: "Category Not Found", robots: { index: false, follow: true } };
  }

  // Total category inventory (not filtered by search q)
  const dealCount = await countApprovedDealsInCategory(category.slug);
  const indexable = dealCount >= MIN_CATEGORY_DEALS_FOR_INDEX;

  const isSecurity = category.slug === SECURITY_AND_PRIVACY_SLUG;
  const title = isSecurity
    ? SECURITY_AND_PRIVACY_SEO.title
    : `${category.name} Deals & Discounts`;
  const description = isSecurity
    ? SECURITY_AND_PRIVACY_SEO.description
    : category.description ||
      `Verified ${category.name.toLowerCase()} deals and coupon codes. Validity can change; check each deal page.`;
  const path = `/categories/${category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
      images: defaultOgImages(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultOgImage()],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { q } = await searchParams;
  const search = q || "";

  const [category, deals, allCategories, totalCount, brandDeals] =
    await Promise.all([
      getCategoryBySlug(slug),
      getApprovedDeals({ categorySlug: slug, search }),
      getCategories(),
      countApprovedDealsInCategory(slug),
      // Brands for intro must reflect the full category, not search-filtered results
      search
        ? getApprovedDeals({ categorySlug: slug, take: 15 })
        : Promise.resolve(null),
    ]);

  if (!category) notFound();

  const activeCategories = allCategories.filter((c) => c._count.deals > 0);

  const brandSource = brandDeals ?? deals;
  const isSecurity = category.slug === SECURITY_AND_PRIVACY_SLUG;
  const intro = buildCategoryIntro({
    name: category.name,
    description: isSecurity
      ? SECURITY_AND_PRIVACY_SEO.description
      : category.description,
    dealCount: totalCount,
    brandNames: [
      ...new Set(
        brandSource
          .map((d) => d.brandName)
          .filter((name): name is string => Boolean(name))
      ),
    ],
  });

  const Icon = iconMap[category.icon] ?? Tag;
  const iconContrast = contrastText(category.color);
  const path = `/categories/${category.slug}`;

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: isSecurity
            ? SECURITY_AND_PRIVACY_SEO.h1
            : `${category.name} Deals`,
          description: intro.lead,
          path,
          type: "CollectionPage",
        })}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Categories", path: "/categories" },
          { name: category.name, path },
        ])}
      />
      {deals.length > 0 && (
        <JsonLd
          data={itemListSchema({
            name: `${category.name} deals`,
            description: `Approved offers in ${category.name}.`,
            path,
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
        <div
          className="border-b border-border px-4 py-10 sm:px-6 lg:px-8"
          style={{ backgroundColor: `${category.color}10` }}
        >
          <div className="mx-auto max-w-7xl">
            <Button asChild variant="ghost" size="sm" className="mb-4 w-fit gap-1.5 pl-0">
              <Link href="/categories">
                <ArrowLeft className="h-4 w-4" />
                All categories
              </Link>
            </Button>

            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: iconContrast.backgroundColor }}
              >
                <Icon className="h-7 w-7" style={{ color: iconContrast.color }} />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {isSecurity
                    ? SECURITY_AND_PRIVACY_SEO.h1
                    : `${category.name} Deals`}
                </h1>
                {(isSecurity || category.description) && (
                  <p className="mt-1 max-w-2xl text-muted-foreground">
                    {isSecurity
                      ? SECURITY_AND_PRIVACY_SEO.description
                      : category.description}
                  </p>
                )}
              </div>
            </div>

            <form
              action={`/categories/${slug}`}
              role="search"
              className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row"
            >
              <div className="relative min-w-0 flex-1">
                <label htmlFor="category-search" className="sr-only">
                  Search {category.name} deals
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="category-search"
                  name="q"
                  defaultValue={search}
                  placeholder={`Search ${category.name.toLowerCase()} deals…`}
                  className="h-11 pl-9"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
              <Button type="submit" className="h-11 min-h-11">
                <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                Search
              </Button>
            </form>
          </div>
        </div>

        <section
          className="border-b border-border bg-card/40 px-4 py-8 sm:px-6 lg:px-8"
          aria-labelledby="category-intro-heading"
        >
          <div className="mx-auto max-w-3xl">
            <h2
              id="category-intro-heading"
              className="text-xl font-bold tracking-tight"
            >
              {intro.heading}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              <strong className="font-semibold text-foreground">{intro.lead}</strong>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {intro.body}
            </p>
            <ul className="mt-4 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
              {intro.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium text-muted-foreground">Category:</span>
            {activeCategories.map((cat) => (
              <Link key={cat.slug} href={`/categories/${cat.slug}`}>
                <Badge
                  variant={cat.slug === slug ? "default" : "outline"}
                  className="cursor-pointer rounded-full px-3"
                >
                  {cat.name}
                </Badge>
              </Link>
            ))}
          </div>

          {deals.length > 0 ? (
            <DealGrid deals={deals} />
          ) : (
            <EmptyState
              title="No deals in this category"
              description="Be the first to submit a deal here."
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
