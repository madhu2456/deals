import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { CategoryCard } from "../components/CategoryCard";
import { EmptyState } from "../components/EmptyState";
import { getCategories } from "@/lib/data";
import { itemListSchema, JsonLd, webPageSchema } from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deal Categories — Browse by Topic",
  description:
    "Browse verified deals by category: AI tools, cloud hosting, design software, productivity apps, learning platforms, and more.",
  alternates: { canonical: "/categories" },
  openGraph: {
    title: "Deal Categories — Browse by Topic",
    description:
      "Browse verified deals by category: AI, cloud, design, productivity, and more.",
    url: absoluteUrl("/categories"),
  },
};

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: "Deal Categories",
          description:
            "Browse verified deals by category across software, services, and products.",
          path: "/categories",
          type: "CollectionPage",
        })}
      />
      <JsonLd
        data={itemListSchema({
          name: "Deal categories",
          description: "Topic hubs for curated discounts and coupon codes.",
          path: "/categories",
          items: categories.map((c) => ({
            name: c.name,
            path: `/categories/${c.slug}`,
            description: c.description,
          })),
        })}
      />

      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Browse deals by category
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-pretty text-muted-foreground">
              Explore verified discounts grouped by topic — from AI tools and cloud hosting to travel and wellness.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {categories.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {categories.map((category) => (
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
          ) : (
            <EmptyState title="No categories yet" showSubmit={false} />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
