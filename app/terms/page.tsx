import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl, defaultOgImages, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Terms of Service | ${SITE_NAME}`,
  description: `Terms governing your use of ${SITE_NAME}, deal submissions, and directory listings.`,
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Terms of Service | ${SITE_NAME}`,
    description: `Terms governing your use of ${SITE_NAME}, deal submissions, and directory listings.`,
    url: absoluteUrl("/terms"),
    type: "website",
    images: defaultOgImages(),
  },
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Terms of Service
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: 27 July 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <h2>1. Acceptance</h2>
            <p>
              By using this website and submitting deals, you agree to these terms.
              If you do not agree, please do not use the site.
            </p>

            <h2>2. Deal submissions</h2>
            <p>
              You are responsible for the accuracy of any deal you submit. We review
              all submissions before publishing and reserve the right to reject, edit,
              or remove any submission at our discretion. Do not submit expired,
              fraudulent, or misleading deals.
            </p>

            <h2>3. Directory listings</h2>
            <p>
              Deal listings are provided for informational purposes. We do not
              guarantee the availability, accuracy, or validity of any listed coupon
              code, discount, or offer. Merchants may change or cancel offers at any
              time without notice to us.
            </p>

            <h2>4. Affiliate links</h2>
            <p>
              Some outbound links to merchant sites may be affiliate or referral links.
              This means we may earn a commission if you make a purchase through those
              links, at no additional cost to you. See our{" "}
              <a
                href="/affiliate-disclosure"
                className="text-primary underline-offset-2 hover:underline"
              >
                Affiliate Disclosure
              </a>{" "}
              for details.
            </p>

            <h2>5. Intellectual property</h2>
            <p>
              Brand names, logos, and trademarks displayed on this site belong to their
              respective owners. Deal descriptions written by us are our original content.
            </p>

            <h2>6. Limitation of liability</h2>
            <p>
              This site is provided &ldquo;as is&rdquo; without warranties of any kind. We are not
              liable for any damages arising from your use of the site, deal listings,
              or third-party merchant links.
            </p>

            <h2>7. Changes</h2>
            <p>
              We may update these terms at any time. Continued use of the site after
              changes constitutes acceptance of the revised terms.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
