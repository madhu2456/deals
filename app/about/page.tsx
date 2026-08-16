import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl, defaultOgImages, PUBLISHER, SITE_NAME } from "@/lib/site";

const title = `About ${SITE_NAME}`;
const description = `Learn about ${SITE_NAME} — a curated directory of verified deals, coupons, and discounts for software, SaaS tools, and more.`;

export const metadata: Metadata = {
  // absolute: the layout template would append " | SITE_NAME" again
  // (same duplicate-suffix bug fixed on /privacy and /terms, F-DEAL-011)
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title,
    description,
    url: absoluteUrl("/about"),
    type: "website",
    images: defaultOgImages(),
  },
};

export default function AboutPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              About {SITE_NAME}
            </h1>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <p>
              <strong>{SITE_NAME}</strong> is a curated directory of verified
              deals, coupon codes, and reviewed discounts on software, SaaS
              tools, cloud services, design apps, learning platforms, and
              everyday products.
            </p>

            <h2>How We Work</h2>
            <p>
              Every deal is reviewed by a human before it appears in the
              directory. Community submissions start as pending and go live only
              after approval. Deals are reviewed for clarity and terms; offers
              with a fixed expiry are checked periodically; some offers have no
              fixed expiry. Always confirm the final terms on the merchant’s
              site before claiming.
            </p>

            <h2>Affiliate Disclosure</h2>
            <p>
              Some links on this site are affiliate links. If you make a
              purchase through them, we may earn a small commission at no extra
              cost to you. Read our full{" "}
              <Link
                href="/affiliate-disclosure"
                className="text-primary underline-offset-2 hover:underline"
              >
                affiliate disclosure
              </Link>{" "}
              for details.
            </p>

            <h2>Built by {PUBLISHER.name}</h2>
            <p>
              <a
                href={PUBLISHER.profile}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {PUBLISHER.name}
              </a>{" "}
              is an AI &amp; Analytics Engineer building open-source tools and
              platforms. This deals directory is one of several products in the
              madhudadi.in ecosystem. Explore the{" "}
              <a
                href={PUBLISHER.blog}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                blog
              </a>{" "}
              and{" "}
              <a
                href={PUBLISHER.udemyEnroller}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Udemy Enroller
              </a>{" "}
              for more projects.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
