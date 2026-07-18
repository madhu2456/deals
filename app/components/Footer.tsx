import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

const linkClass =
  "text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";

const externalLinkClass =
  "inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Deals home"
            >
              <BrandLogo size="sm" />
              <span className="text-lg font-bold tracking-tight text-foreground">
                Deals
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Verified deals, coupons, and discounts for everyone. Save on the tools and products you love.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">Discover</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <Link href="/deals" className={linkClass}>
                  All Deals
                </Link>
              </li>
              <li>
                <Link href="/categories" className={linkClass}>
                  Categories
                </Link>
              </li>
              <li>
                <Link href="/submit" className={linkClass}>
                  Submit a Deal
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-foreground">Who&apos;s behind Deals?</h2>
            <ul className="mt-3 space-y-2.5 text-sm">
              <li>
                <a
                  href="https://madhudadi.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClass}
                >
                  Meet Madhu
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://madhudadi.in/blog"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClass}
                >
                  Read the blog
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </a>
              </li>
              <li>
                <a
                  href="https://udemyenroller.madhudadi.in"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={externalLinkClass}
                >
                  Udemy Course Enroller
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* SEO & GEO credit */}
        <div className="mt-10 rounded-2xl border border-primary/15 bg-primary/5 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  SEO &amp; GEO improved by Adticks
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Search and generative-engine visibility, optimized for real discovery.
                </p>
              </div>
            </div>
            <a
              href="https://adticks.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:self-center"
            >
              Visit Adticks
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground">
          © {currentYear} Deals. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
