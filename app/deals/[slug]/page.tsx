import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Tag,
  Store,
  Sparkles,
  ChevronRight,
  BadgePercent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { getDealBySlug, getApprovedDeals } from "@/lib/data";
import { formatDate, discountLabel } from "@/lib/format";
import {
  breadcrumbSchema,
  JsonLd,
  offerSchema,
  webPageSchema,
} from "@/lib/seo/json-ld";
import { absoluteUrl } from "@/lib/site";
import { CopyCodeButton } from "./CopyCodeButton";
import { ClaimDealButton } from "./ClaimDealButton";

interface DealPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: DealPageProps): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDealBySlug(slug);
  if (!deal) {
    return {
      title: "Deal Not Found",
      robots: { index: false, follow: true },
    };
  }

  const description =
    deal.shortDescription ||
    deal.description.slice(0, 155) + (deal.description.length > 155 ? "…" : "");
  const title = `${deal.title} | ${deal.brandName} Deal`;
  const path = `/deals/${deal.slug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: absoluteUrl(path),
      type: "website",
      images: deal.logoUrl
        ? [{ url: deal.logoUrl, alt: deal.brandName }]
        : [{ url: absoluteUrl("/icon-512.png"), alt: "Deals" }],
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function DealPage({ params }: DealPageProps) {
  const { slug } = await params;
  const deal = await getDealBySlug(slug);

  if (!deal) notFound();

  const relatedDeals = await getApprovedDeals({
    categorySlug: deal.category.slug,
    take: 3,
    excludeId: deal.id,
  });

  const discount = discountLabel(deal.discountType, deal.discountValue);
  const hasPricing = Boolean(deal.originalPrice || deal.discountedPrice);
  const path = `/deals/${deal.slug}`;

  return (
    <>
      <JsonLd
        data={webPageSchema({
          title: deal.title,
          description: deal.shortDescription || deal.description,
          path,
          dateModified: deal.updatedAt,
        })}
      />
      <JsonLd data={offerSchema(deal)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "Deals", path: "/deals" },
          { name: deal.category.name, path: `/categories/${deal.category.slug}` },
          { name: deal.brandName, path },
        ])}
      />

      <Header />
      <main id="main-content" className="flex-1 pb-28 lg:pb-0">
        {/* Breadcrumb */}
        <div className="border-b border-border bg-card/40 px-4 py-3 sm:px-6 lg:px-8">
          <nav
            aria-label="Breadcrumb"
            className="mx-auto flex max-w-4xl min-w-0 items-center gap-1.5 text-sm text-muted-foreground"
          >
            <Link
              href="/deals"
              className="shrink-0 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Deals
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <Link
              href={`/categories/${deal.category.slug}`}
              className="max-w-[40%] truncate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {deal.category.name}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            <span className="min-w-0 truncate font-medium text-foreground" aria-current="page">
              {deal.brandName}
            </span>
          </nav>
        </div>

        {/* Header */}
        <div className="border-b border-border bg-card/30 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-4xl min-w-0">
            <Button asChild variant="ghost" size="sm" className="mb-4 w-fit gap-1.5 pl-0">
              <Link href="/deals">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to deals
              </Link>
            </Button>

            <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted text-xl font-bold text-foreground ring-1 ring-border/60"
                  aria-hidden="true"
                >
                  {deal.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={deal.logoUrl}
                      alt=""
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    deal.brandName.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-secondary">
                      {deal.category.name}
                    </Badge>
                    {deal.isFeatured && (
                      <Badge className="gap-1 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                        <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                        Featured
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-2 text-balance break-words text-2xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">
                    {deal.title}
                  </h1>
                  <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">
                    {deal.brandName}
                  </p>
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col items-start gap-1 rounded-2xl border border-border bg-card px-4 py-3 sm:w-auto sm:max-w-xs sm:items-end sm:border-0 sm:bg-transparent sm:p-0">
                <span className="inline-flex items-center gap-1.5 break-words text-2xl font-bold text-primary [overflow-wrap:anywhere] sm:text-right">
                  <BadgePercent className="hidden h-5 w-5 sm:inline" aria-hidden="true" />
                  {discount}
                </span>
                {hasPricing && (
                  <p className="text-sm text-muted-foreground sm:text-right">
                    {deal.originalPrice && (
                      <span className="mr-2 line-through opacity-70">{deal.originalPrice}</span>
                    )}
                    {deal.discountedPrice && (
                      <span className="font-semibold text-foreground">{deal.discountedPrice}</span>
                    )}
                  </p>
                )}
                {deal.expiryDate && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Expires {formatDate(deal.expiryDate)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 space-y-6">
              {/* Answer-first summary for AEO / featured snippets */}
              <Card className="border-border border-primary/20 bg-primary/5 surface-elevated">
                <CardContent className="p-6">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                    Deal summary
                  </h2>
                  <p className="mt-2 text-pretty text-base leading-relaxed text-foreground">
                    <strong>{deal.brandName}</strong> is offering{" "}
                    <strong>{discount}</strong>
                    {deal.couponCode ? (
                      <>
                        {" "}
                        with coupon code{" "}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm" translate="no">
                          {deal.couponCode}
                        </code>
                      </>
                    ) : null}
                    . {deal.shortDescription || deal.description.slice(0, 160)}
                    {deal.expiryDate
                      ? ` Offer expires ${formatDate(deal.expiryDate)}.`
                      : ""}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border surface-elevated">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-foreground">About this deal</h2>
                  <p className="mt-3 whitespace-pre-line text-pretty leading-relaxed text-muted-foreground">
                    {deal.description}
                  </p>
                </CardContent>
              </Card>

              <section aria-labelledby="related-heading">
                <h2 id="related-heading" className="text-lg font-semibold text-foreground">
                  Related deals
                </h2>
                {relatedDeals.length > 0 ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {relatedDeals.slice(0, 2).map((d) => (
                      <Link
                        key={d.id}
                        href={`/deals/${d.slug}`}
                        className="group rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-bold"
                            aria-hidden="true"
                          >
                            {d.brandName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-primary">
                              {discountLabel(d.discountType, d.discountValue)}
                            </p>
                            <h3 className="line-clamp-2 break-words font-medium leading-snug text-foreground group-hover:text-primary">
                              {d.title}
                            </h3>
                            <p className="truncate text-sm text-muted-foreground">{d.brandName}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No related deals yet.</p>
                )}
              </section>
            </div>

            {/* Desktop claim rail */}
            <aside className="hidden space-y-4 lg:block" aria-label="Claim deal">
              <Card className="sticky top-24 border-border bg-primary text-primary-foreground surface-elevated">
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">Claim this deal</h2>
                  <p className="mt-1 text-sm text-primary-foreground/85">
                    Visit {deal.brandName} and apply the offer at checkout.
                  </p>

                  {deal.couponCode && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-primary-foreground/80">Coupon code</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <code
                          className="min-w-0 flex-1 rounded-lg bg-primary-foreground/10 px-3 py-2.5 font-mono text-sm tracking-wide"
                          translate="no"
                        >
                          {deal.couponCode}
                        </code>
                        <CopyCodeButton
                          code={deal.couponCode}
                          dealId={deal.id}
                          dealSlug={deal.slug}
                          dealTitle={deal.title}
                          brandName={deal.brandName}
                        />
                      </div>
                    </div>
                  )}

                  <ClaimDealButton
                    dealId={deal.id}
                    dealUrl={deal.dealUrl}
                    brandName={deal.brandName}
                    dealSlug={deal.slug}
                    dealTitle={deal.title}
                    couponCode={deal.couponCode}
                    className="mt-4 w-full bg-white text-primary hover:bg-white/90"
                  />
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardContent className="p-5">
                  <h2 className="font-semibold text-foreground">Deal info</h2>
                  <Separator className="my-3" />
                  <ul className="space-y-3 text-sm">
                    <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <Store className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="break-words">{deal.brandName}</span>
                    </li>
                    {deal.brandUrl && (
                      <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <ExternalLink className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <a
                          href={deal.brandUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          Official website
                        </a>
                      </li>
                    )}
                    <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <Tag className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <Link
                        href={`/categories/${deal.category.slug}`}
                        className="break-words underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {deal.category.name}
                      </Link>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </aside>

            {/* Mobile deal info (claim is sticky bar) */}
            <div className="space-y-4 lg:hidden">
              {deal.couponCode && (
                <Card className="border-border">
                  <CardContent className="p-5">
                    <p className="text-sm font-medium text-foreground">Coupon code</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code
                        className="min-w-0 flex-1 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2.5 font-mono text-sm tracking-wide"
                        translate="no"
                      >
                        {deal.couponCode}
                      </code>
                      <CopyCodeButton
                        code={deal.couponCode}
                        variant="outline"
                        dealId={deal.id}
                        dealSlug={deal.slug}
                        dealTitle={deal.title}
                        brandName={deal.brandName}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="border-border">
                <CardContent className="p-5">
                  <h2 className="font-semibold text-foreground">Deal info</h2>
                  <Separator className="my-3" />
                  <ul className="space-y-3 text-sm">
                    <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <Store className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="break-words">{deal.brandName}</span>
                    </li>
                    {deal.brandUrl && (
                      <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                        <ExternalLink className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <a
                          href={deal.brandUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate underline-offset-2 hover:underline"
                        >
                          Official website
                        </a>
                      </li>
                    )}
                    <li className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <Tag className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <Link
                        href={`/categories/${deal.category.slug}`}
                        className="break-words underline-offset-2 hover:underline"
                      >
                        {deal.category.name}
                      </Link>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky mobile claim bar — marketplace best practice */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgb(15_23_42/0.08)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">{discount}</p>
            <p className="truncate text-xs text-muted-foreground">{deal.brandName}</p>
          </div>
          {deal.couponCode && (
            <CopyCodeButton
              code={deal.couponCode}
              variant="outline"
              className="shrink-0"
              dealId={deal.id}
              dealSlug={deal.slug}
              dealTitle={deal.title}
              brandName={deal.brandName}
            />
          )}
          <ClaimDealButton
            dealId={deal.id}
            dealUrl={deal.dealUrl}
            brandName={deal.brandName}
            dealSlug={deal.slug}
            dealTitle={deal.title}
            couponCode={deal.couponCode}
            size="default"
            variant="default"
            className="shrink-0"
          />
        </div>
      </div>

      <Footer />
    </>
  );
}
