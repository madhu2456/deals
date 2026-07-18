import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { DealGrid } from "../../components/DealGrid";
import { EmptyState } from "../../components/EmptyState";
import { getCategoryBySlug, getApprovedDeals, getCategories } from "@/lib/data";
import { getIcon } from "@/lib/icons";
import {
  breadcrumbSchema,
  itemListSchema,
  JsonLd,
  webPageSchema,
} from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) {
    return { title: "Category Not Found", robots: { index: false, follow: true } };
  }

  const title = `${category.name} Deals & Discounts`;
  const description =
    category.description ||
    `Verified ${category.name.toLowerCase()} deals, coupon codes, and exclusive discounts.`;
  const path = `/categories/${category.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { q } = await searchParams;
  const search = q || "";

  const [category, deals, allCategories] = await Promise.all([
    getCategoryBySlug(slug),
    getApprovedDeals({ categorySlug: slug, search }),
    getCategories(),
  ]);

  if (!category) notFound();

  const Icon = getIcon(category.icon);
  const path = `/categories/${category.slug}`;

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: `${category.name} Deals`,
          description:
            category.description ||
            `Verified ${category.name.toLowerCase()} deals and coupon codes.`,
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
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{ backgroundColor: category.color }}
              >
                <Icon className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {category.name} Deals
                </h1>
                {category.description && (
                  <p className="mt-1 max-w-2xl text-muted-foreground">{category.description}</p>
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

        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium text-muted-foreground">Category:</span>
            {allCategories.map((cat) => (
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
