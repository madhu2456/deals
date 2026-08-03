import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl, defaultOgImages, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  // Bare "Contact" — layout.tsx title.template already appends " | Deals by Madhu Dadi"
  title: "Contact",
  description: `How to reach the team behind ${SITE_NAME} — questions, deal submissions, corrections, and security reports.`,
  alternates: { canonical: "/contact" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Contact | ${SITE_NAME}`,
    description: `How to reach the team behind ${SITE_NAME} — questions, deal submissions, corrections, and security reports.`,
    url: absoluteUrl("/contact"),
    type: "website",
    images: defaultOgImages(),
  },
};

export default function ContactPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Contact
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We typically reply within 1–2 business days.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <h2>Email us</h2>
            <p>
              For questions, deal submissions, corrections, and security reports,
              email{" "}
              <a
                href="mailto:hello@madhudadi.in"
                className="text-primary underline-offset-2 hover:underline"
              >
                hello@madhudadi.in
              </a>
              . This address is also pinned in our security.txt for security tooling.
            </p>

            <h2>When you&apos;ll hear back</h2>
            <p>
              We typically reply within 1–2 business days. Urgent security reports are
              prioritised and acknowledged faster.
            </p>

            <h2>What to include</h2>
            <ul>
              <li>
                For deal submissions or questions about a deal: the deal URL and the
                discount details.
              </li>
              <li>
                For corrections to a published listing: the deal page URL and what
                needs to change.
              </li>
              <li>
                For security reports: use the subject prefix &ldquo;Security&rdquo; so
                the report reaches us as quickly as possible.
              </li>
            </ul>

            <h2>Other ways to reach us</h2>
            <ul>
              <li>
                <a
                  href="/affiliate-disclosure"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Affiliate Disclosure
                </a>
              </li>
              <li>
                <a
                  href="/terms"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Terms
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Privacy
                </a>
              </li>
              <li>
                <a
                  href="https://madhudadi.in"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  madhudadi.in
                </a>
              </li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
