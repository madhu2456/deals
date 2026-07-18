import Script from "next/script";

/** GA4 Measurement ID — override with NEXT_PUBLIC_GA_ID */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-THQ1ZPJ4B7";

/**
 * Google Analytics 4 (gtag.js).
 * Loads after the page is interactive. Works with GTM's dataLayer.
 *
 * Note: If you also add a GA4 Configuration tag inside GTM for the same
 * property, pageviews will double-count. Prefer either this component OR
 * GTM GA4 — not both for the same G- ID.
 */
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-gtag" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', {
  page_path: window.location.pathname,
  anonymize_ip: true
});
        `.trim()}
      </Script>
    </>
  );
}
