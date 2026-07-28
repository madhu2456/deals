import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";

export const metadata: Metadata = {
  title: "Affiliate Disclosure",
  description:
    "Transparency about how affiliate and referral links work on the Deals directory.",
  alternates: { canonical: "/affiliate-disclosure" },
  robots: { index: false, follow: false },
};

export default function AffiliateDisclosurePage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Affiliate Disclosure
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: 27 July 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <h2>How we earn</h2>
            <p>
              Some links on this site are affiliate or referral links. This means if
              you click a deal link and make a purchase or sign up, we may receive a
              small commission from the merchant. This does not affect the price you
              pay.
            </p>

            <h2>Why we use affiliate links</h2>
            <p>
              Running this directory takes time: finding, verifying, and moderating
              deals. Affiliate commissions help cover hosting and maintenance costs
              so we can keep the directory free for everyone.
            </p>

            <h2>Our commitment</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                We only list deals we believe offer genuine value. A deal's inclusion
                is never determined by commission rates.
              </li>
              <li>
                We review every submission before publishing. Spam and low-value
                listings are rejected regardless of affiliate potential.
              </li>
              <li>
                Outbound merchant links are marked with{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-sm">
                  rel="sponsored nofollow"
                </code>{" "}
                so search engines understand the relationship.
              </li>
            </ul>

            <h2>Affiliate programs</h2>
            <p>
              We may participate in affiliate programs including but not limited to
              partner/affiliate networks and individual merchant referral programs.
              This disclosure covers all current and future affiliate relationships.
            </p>

            <h2>Your choice</h2>
            <p>
              Using affiliate links is optional. You can always navigate directly to
              a merchant's website without using our links if you prefer. The coupon
              codes and discount details we list are usable regardless of how you
              reach the merchant.
            </p>

            <h2>Questions</h2>
            <p>
              For questions about this disclosure, contact{" "}
              <a
                href="mailto:hello@madhudadi.in"
                className="text-primary underline-offset-2 hover:underline"
              >
                hello@madhudadi.in
              </a>
              .
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
