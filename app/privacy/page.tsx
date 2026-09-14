import type { Metadata } from "next";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { absoluteUrl, defaultOgImages, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  // absolute: the layout template would append " | SITE_NAME" again (F-DEAL-011)
  title: { absolute: `Privacy Policy | ${SITE_NAME}` },
  description: `How ${SITE_NAME} collects, uses, and protects your information when you browse or submit a deal.`,
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
  openGraph: {
    title: `Privacy Policy | ${SITE_NAME}`,
    description: `How ${SITE_NAME} collects, uses, and protects your information when you browse or submit a deal.`,
    url: absoluteUrl("/privacy"),
    type: "website",
    images: defaultOgImages(),
  },
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
              Last updated: 4 Sep 2026
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
            <h2>1. Information we collect</h2>
            <p>
              When you submit a deal through our form, we collect the information you
              provide: the deal URL, title, description, category, discount details,
              and your email address. An email address is required for deal
              submissions so we can follow up if needed. Your name is optional. We do
              not require an account to browse deals.
            </p>

            <h2>2. How we use your information</h2>
            <p>
              We use submitted deal information solely to review and publish verified
              deals on this directory. Your email address is used to follow up about
              your submission when necessary. We never sell, rent, or share your
              personal data with third parties.
            </p>

            <h2>3. Cookies and analytics</h2>
            <p>
              Analytics and advertising tags are managed through Google Tag Manager
              (GTM), which is disabled unless the operator configures it
              (env-gated). When enabled, GTM and its tags load{" "}
              <strong>only after you accept the cookie consent banner</strong>.
              Consent Mode v2 signals default to denied for analytics and
              advertising storage before any tag loads; declining tracking keeps
              those signals denied. Web fonts are self-hosted; no font CDN
              requests are made.
            </p>
            <p>
              <strong>Storage we set on your device:</strong> a{" "}
              <code>deals_cookie_consent</code> entry in your browser&apos;s
              local storage (records your banner choice; strictly necessary for
              this site to respect your consent), and, for the site operator
              only, an <code>admin-session</code> httpOnly cookie (operator login
              session; set only if you sign in to the admin area — regular
              visitors never receive it).
            </p>
            <p>
              The deal submission form and the admin login page are protected by
              Cloudflare Turnstile (bot verification) where the operator has
              enabled it — on admin login, the widget renders only when
              two-factor authentication is enabled <em>and</em> Turnstile keys
              are configured (both must be set) — see Subprocessors below and
              Cloudflare&apos;s privacy policy at{" "}
              <a
                href="https://www.cloudflare.com/privacypolicy/"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                cloudflare.com/privacypolicy
              </a>
              .
            </p>

            <h2>4. Third-party links</h2>
            <p>
              Deal listings link to external merchant websites. We are not responsible
              for the privacy practices or content of those third-party sites. Please
              review their privacy policies before sharing personal data. Some of
              these links may be affiliate or referral links — see our{" "}
              <a
                href="/affiliate-disclosure"
                className="text-primary underline-offset-2 hover:underline"
              >
                Affiliate Disclosure
              </a>{" "}
              for how that works.
            </p>

            <h2>5. Subprocessors</h2>
            <p>
              We use the following subprocessors to operate and protect this site.
              Each processes data only for the purpose stated; none may use it for
              their own purposes.
            </p>
            <ul>
              <li>
                <strong>Cloudflare</strong> — content delivery network and proxy
                (serves pages and images; processes IP addresses in connection logs
                for security and DDoS/WAF protection).
              </li>
              <li>
                <strong>Cloudflare Turnstile</strong> — bot protection on the deal
                submission form and the admin login page, only when enabled (see
                the Turnstile section of the README). Processes the visitor&apos;s
                IP and browser signals to verify the visitor is human. See
                Cloudflare&apos;s{" "}
                <a
                  href="https://www.cloudflare.com/privacypolicy/"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  privacy policy
                </a>
                .
              </li>
              <li>
                <strong>Google</strong> — analytics (Google Analytics) loaded only
                after you accept the cookie consent banner, and Google Search Console
                for site-indexing verification. Web fonts are self-hosted; no Google
                Fonts requests are made.
              </li>
              <li>
                <strong>Upstash</strong> — shared rate-limit buckets across instances,
                only if the operator configures Upstash Redis (absent by default; the
                site then uses in-memory limiting).
              </li>
            </ul>

            <h2>6. Data retention</h2>
            <p>
              Deal submissions and associated metadata are retained as long as the
              deal remains published. You can request deletion of your submission data
              by contacting us.
            </p>

            <h2>7. India DPDP notice (Data Fiduciary)</h2>
            <p>
              Where the Digital Personal Data Protection Act, 2023 (DPDP Act) of India
              applies, the operator of {SITE_NAME} acts as a{" "}
              <strong>Data Fiduciary</strong> for personal data you provide (for
              example, an email address on a deal submission). We process that data
              only for the purposes described in this policy, take reasonable security
              safeguards, and respond to lawful requests to access or erase personal
              data you have submitted. Contact us using the address below to exercise
              applicable rights, raise a privacy concern, or file a grievance — see
              the contact section for our response-time commitment.
            </p>

            <h2>8. Contact and grievance redressal</h2>
            <p>
              For privacy-related inquiries or grievances, contact{" "}
              <a
                href="mailto:hello@madhudadi.in"
                className="text-primary underline-offset-2 hover:underline"
              >
                hello@madhudadi.in
              </a>
              . We aim to acknowledge and respond to grievances within{" "}
              <strong>30 days</strong> of receipt.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
