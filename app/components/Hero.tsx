import Link from "next/link";
import { Search, TrendingUp, ShieldCheck, Sparkles, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HeroProps {
  dealCount: number;
}

export function Hero({ dealCount }: HeroProps) {
  const popularSearches = ["Notion", "Figma", "Spotify", "ChatGPT", "Vercel"];

  return (
    <section
      className="relative overflow-hidden border-b border-border bg-gradient-to-br from-background via-background to-secondary/40 px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
      aria-labelledby="hero-heading"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm font-medium text-foreground shadow-sm">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="tabular-nums">
            {dealCount}+ verified {dealCount === 1 ? "deal" : "deals"}
          </span>
        </div>

        <h1
          id="hero-heading"
          className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Verified deals &amp; coupon codes for{" "}
          <span className="text-primary">everyone</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Find curated discounts on software, SaaS tools, and products you already use. Reviewed offers only — no spam.
        </p>

        <form
          action="/deals"
          role="search"
          className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <div className="relative min-w-0 flex-1">
            <label htmlFor="hero-search" className="sr-only">
              Search deals, brands, or categories
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="hero-search"
              name="q"
              placeholder="Search deals, brands, or categories…"
              className="h-12 rounded-xl border-border bg-card pl-11 text-base shadow-sm"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 min-h-12 gap-2 rounded-xl px-6">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
            Popular:
          </span>
          {popularSearches.map((term) => (
            <Link
              key={term}
              href={`/deals?q=${encodeURIComponent(term)}`}
              className="rounded-full bg-card px-3 py-1.5 text-foreground/80 shadow-sm ring-1 ring-border transition-colors duration-200 hover:bg-primary/10 hover:text-primary hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {term}
            </Link>
          ))}
        </div>

        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Verified offers
          </li>
          <li className="inline-flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            Updated regularly
          </li>
        </ul>
      </div>
    </section>
  );
}
