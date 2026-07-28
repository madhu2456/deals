import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Deals collects, uses, and protects your information when you browse or submit a deal.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Privacy Policy
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: 27 July 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <h2>1. Information we collect</h2>
            <p>
              When you submit a deal through our form, we collect the information you
              provide: the deal URL, title, description, category, discount details,
              and your email address if you choose to provide one. We do not require
              an account to browse deals.
            </p>

            <h2>2. How we use your information</h2>
            <p>
              We use submitted deal information solely to review and publish verified
              deals on this directory. Your email address, if provided, may be used
              to follow up about your submission. We never sell, rent, or share your
              personal data with third parties.
            </p>

            <h2>3. Cookies</h2>
            <p>
              We use Google Analytics to understand how visitors use this site.
              Analytics cookies are set only after you accept the cookie consent
              banner. You can decline tracking at any time. This site does not use
              advertising or targeting cookies.
            </p>

            <h2>4. Third-party links</h2>
            <p>
              Deal listings link to external merchant websites. We are not responsible
              for the privacy practices or content of those third-party sites. Please
              review their privacy policies before sharing personal data.
            </p>

            <h2>5. Data retention</h2>
            <p>
              Deal submissions and associated metadata are retained as long as the
              deal remains published. You can request deletion of your submission data
              by contacting us.
            </p>

            <h2>6. Contact</h2>
            <p>
              For privacy-related inquiries, contact{" "}
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
