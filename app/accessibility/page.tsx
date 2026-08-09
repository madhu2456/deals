import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl, defaultOgImages, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Accessibility",
  description: `${SITE_NAME} accessibility statement — WCAG 2.2 Level AA goals, known limitations, and how to report barriers.`,
  alternates: { canonical: "/accessibility" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Accessibility | ${SITE_NAME}`,
    description: `${SITE_NAME} accessibility statement — WCAG 2.2 Level AA goals, known limitations, and how to report barriers.`,
    url: absoluteUrl("/accessibility"),
    type: "website",
    images: defaultOgImages(),
  },
};

export default function AccessibilityPage() {
  return (
    <>
      <Header />
      <main id="main-content" className="flex-1">
        <div className="border-b border-border bg-card/30 px-4 py-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Accessibility statement
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: 9 Aug 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <p>
              {SITE_NAME} aims to make verified deals and coupons usable by as
              many people as possible, including people who use assistive
              technologies. We design and test against the{" "}
              <strong>Web Content Accessibility Guidelines (WCAG) 2.2</strong>{" "}
              Level <strong>AA</strong> success criteria as our target standard.
            </p>

            <h2>1. Conformance goal</h2>
            <p>
              We target WCAG 2.2 Level AA for core browsing journeys: home,
              categories, deal listings, deal detail pages, search, and deal
              submission. This is an ongoing effort—not a one-time certification.
              Some third-party embeds (for example analytics loaded after cookie
              consent, or CAPTCHA when enabled) may have their own accessibility
              constraints outside our full control.
            </p>

            <h2>2. Measures we take</h2>
            <ul>
              <li>
                Semantic HTML structure with a single main landmark (
                <code>id=&quot;main-content&quot;</code>) and a skip link to it
              </li>
              <li>
                Keyboard-operable navigation, forms, and dialogs (including the
                cookie consent banner)
              </li>
              <li>
                Visible focus styles and sufficient color contrast for text and
                interactive controls in the default theme
              </li>
              <li>
                Text alternatives for meaningful images and logos where
                provided; decorative icons marked appropriately
              </li>
              <li>
                Form labels, error summaries, and{" "}
                <code>aria-invalid</code> / described-by wiring on the submit
                form
              </li>
              <li>
                Respect for reduced-motion preferences on non-essential animation
                where implemented
              </li>
            </ul>

            <h2>3. Known limitations</h2>
            <ul>
              <li>
                Some merchant logos are remote images; if a brand does not
                supply a logo, we fall back to a text initial
              </li>
              <li>
                External deal / merchant sites linked from listings are not under
                our control and may not meet WCAG 2.2 AA
              </li>
              <li>
                When Cloudflare Turnstile is enabled for deal submission, the
                challenge widget is provided by Cloudflare
              </li>
              <li>
                Older browser or assistive-technology combinations may show
                residual issues; we prioritize evergreen browsers and current
                AT versions
              </li>
            </ul>

            <h2>4. Compatibility</h2>
            <p>
              Pages are intended to work with current versions of major browsers
              (Chrome, Firefox, Safari, Edge) and common assistive technologies
              (platform screen readers, keyboard-only use, browser zoom up to
              200%). The site is responsive for small screens.
            </p>

            <h2>5. Feedback and contact</h2>
            <p>
              If you encounter an accessibility barrier on this site, please tell
              us. Include the page URL, what you were trying to do, and the
              assistive technology or browser you used if you can.
            </p>
            <p>
              Email:{" "}
              <a
                href="mailto:hello@madhudadi.in?subject=Accessibility%20feedback%20%E2%80%94%20Deals"
                className="text-primary underline-offset-2 hover:underline"
              >
                hello@madhudadi.in
              </a>
              . We aim to acknowledge accessibility reports within a few
              business days. You can also use our{" "}
              <Link
                href="/contact"
                className="text-primary underline-offset-2 hover:underline"
              >
                contact page
              </Link>
              .
            </p>

            <h2>6. Related policies</h2>
            <ul>
              <li>
                <Link
                  href="/privacy"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Terms of service
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
