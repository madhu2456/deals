"use client";

import Script from "next/script";
import { useCookieConsent } from "./CookieConsent";

/** Env-only container; empty/unset disables GTM. */
export const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim() || "";

/**
 * GTM script — loads only after cookie consent is explicitly accepted.
 * Place inside <body> (or via next/script root layout).
 */
export function GoogleTagManager() {
  const { consent } = useCookieConsent();

  if (!GTM_ID) return null;
  // Only load GTM when consent has been explicitly accepted
  if (consent !== "accepted") return null;

  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
    </Script>
  );
}

/**
 * GTM noscript fallback — must be immediately after opening <body>.
 * Only rendered when consent is accepted (privacy-first).
 */
export function GoogleTagManagerNoscript() {
  const { consent } = useCookieConsent();

  if (!GTM_ID) return null;
  if (consent !== "accepted") return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
