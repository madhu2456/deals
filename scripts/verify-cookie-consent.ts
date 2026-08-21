/**
 * Source-level F309/F308/UI-DEALS-01 guards (no full Next server).
 * Run: pnpm exec tsx scripts/verify-cookie-consent.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const repoRoot = join(__dirname, "..");

const cookieSrc = readFileSync(
  join(repoRoot, "app/components/CookieConsent.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(repoRoot, "app/globals.css"), "utf8");
const headerSrc = readFileSync(
  join(repoRoot, "app/components/Header.tsx"),
  "utf8",
);
const heroSrc = readFileSync(join(repoRoot, "app/components/Hero.tsx"), "utf8");

assert(!/acceptRef\.current\?\.focus\(/.test(cookieSrc), "no Accept autofocus");
assert(!/acceptRef/.test(cookieSrc), "acceptRef removed");
assert(!/e\.key !== ["']Tab["']/.test(cookieSrc), "no Tab-key wrap gate");
assert(!/\.focus\(\)/.test(cookieSrc), "banner does not steal or wrap focus");
assert(
  /e\.key !== ["']Escape["']/.test(cookieSrc) || /e\.key === ["']Escape["']/.test(cookieSrc),
  "Escape still declines",
);
assert(/role="region"/.test(cookieSrc), "banner is a non-modal region");
assert(!/role="dialog"/.test(cookieSrc), "banner is not a dialog");
assert(!/aria-modal/.test(cookieSrc), "aria-modal dropped on non-modal region");

const innerStrip = cookieSrc.match(
  /className="([^"]*max-h-\[72px\][^"]*)"/,
)?.[1];
assert(innerStrip, "inner strip has max-h-[72px]");
assert(/\bh-14\b/.test(innerStrip), "inner strip has h-14");
assert(/\bmin-h-14\b/.test(innerStrip), "inner strip has min-h-14");
assert(/\bflex-row\b/.test(innerStrip), "inner strip is flex-row at all breakpoints");
assert(!/\bflex-col\b/.test(innerStrip), "inner strip is not flex-col");

assert(/href="\/privacy"/.test(cookieSrc), "Privacy Policy is a Link to /privacy");
assert(
  /<Link[\s\S]*?href="\/privacy"[\s\S]*?shrink-0|className=\{`shrink-0[\s\S]*?href="\/privacy"/.test(
    cookieSrc,
  ),
  "Privacy Policy Link is shrink-0",
);
const descBlock = cookieSrc.match(
  /<p id="cookie-consent-desc"[^>]*>[\s\S]*?<\/p>/,
)?.[0];
assert(descBlock, "cookie-consent-desc exists for aria-describedby");
assert(
  !/<Link/.test(descBlock),
  "Privacy is a control, not the last phrase in the description",
);
assert(
  /root\.contains\(e\.target|panelRef[\s\S]{0,80}\.contains\(/.test(cookieSrc),
  "Escape decline is gated on banner contains/panelRef",
);

const homeSearchClass = heroSrc.match(/className="(home-search[^"]*)"/)?.[1];
assert(homeSearchClass, "Hero Search exposes home-search hook");
assert(/\bflex-row\b/.test(homeSearchClass), "home Search is flex-row at all breakpoints");
assert(!/\bflex-col\b/.test(homeSearchClass), "home Search is not flex-col");

assert(
  /html\[data-cookie-banner="open"\] \.home-hero::after/.test(cssSrc),
  "home hero padded when banner is open",
);
assert(
  /html\[data-cookie-banner="open"\] \.home-search/.test(cssSrc),
  "home Search has cookie-banner scroll margin",
);
assert(
  /--cookie-banner-height/.test(cssSrc),
  "cookie banner height token is used",
);
assert(
  /className="home-hero /.test(heroSrc),
  "Hero exposes home-hero hook",
);
assert(
  /className="home-search /.test(heroSrc),
  "Hero Search exposes home-search hook",
);

assert(
  /Browse Deals[\s\S]*focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2/.test(
    headerSrc,
  ) ||
    /focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2[\s\S]*\{link\.label\}/.test(
      headerSrc,
    ),
  "desktop nav links have 2px focus-visible ring + offset",
);
assert(
  (headerSrc.match(/focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2/g) ||
    []).length >= 3,
  "logo + desktop nav + mobile nav share skip-link-matching 2px ring",
);

console.log(
  "OK: cookie strip h-14/max-h-72 flex-row; Escape gated; Search row; F309 non-modal",
);
