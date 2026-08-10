import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  GoogleTagManager,
  GoogleTagManagerNoscript,
} from "./components/GoogleTagManager";
import CookieConsentBanner, {
  CookieConsentProvider,
} from "./components/CookieConsent";
// GA4 is configured in GTM (G-THQ1ZPJ4B7). Do not also load gtag.js here or pageviews double-count.
import {
  JsonLd,
  organizationSchema,
  websiteSchema,
} from "@/lib/seo/json-ld";
import {
  absoluteUrl,
  defaultOgImage,
  defaultOgImages,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
} from "@/lib/site";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: `${SITE_NAME} — Verified Deals, Coupons & Discounts`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: "Madhu Dadi", url: "https://madhudadi.in/profile/" }],
  creator: "Madhu Dadi",
  publisher: SITE_NAME,
  category: "shopping",
  // Do NOT set a sitewide canonical here — each page defines its own.
  // A root canonical of "/" would make every page claim the homepage as canonical.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Verified Deals, Coupons & Discounts`,
    description: SITE_DESCRIPTION,
    images: defaultOgImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Verified Deals, Coupons & Discounts`,
    description: SITE_DESCRIPTION,
    images: [defaultOgImage()],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Hint for crawlers / some AI tools that an LLM context file exists
  other: {
    "llms-txt": absoluteUrl("/llms.txt"),
    "ai-profile": absoluteUrl("/ai-profile.json"),
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e2a" },
  ],
};

/** Consent Mode v2 default-deny — must run in <head> before any GTM/tag loads. */
const CONSENT_DEFAULT_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});gtag('set','ads_data_redaction',true);gtag('set','url_passthrough',true);`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en-IN"
      className={`${plusJakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Consent Mode default denied BEFORE GTM (portfolio Consent Mode pattern) */}
        <script
          dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }}
        />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <CookieConsentProvider>
          <GoogleTagManagerNoscript />
          <CookieConsentBanner />
          <GoogleTagManager />
          <JsonLd data={organizationSchema()} />
          <JsonLd data={websiteSchema()} />
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <TooltipProvider delay={150}>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </TooltipProvider>
        </CookieConsentProvider>
      </body>
    </html>
  );
}
