/**
 * GTM env-only / empty=off (F048 / critic C2).
 *
 * Production must not ship a hardcoded GTM container ID. Empty or unset
 * NEXT_PUBLIC_GTM_ID disables the script and noscript. This static check
 * fails if the old fallback returns as a default, comment, or example.
 *
 *  1. GTM-PT2ZHD3W is absent from app/, lib/, Dockerfile, .env.example
 *     (gtm/ export JSON + IMPORT.md may keep the ID).
 *  2. GoogleTagManager.tsx is env-only (`|| ""` / `?? ""`) and both
 *     components `return null` when GTM_ID is empty.
 *
 * Run: pnpm test:gtm-env
 */
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repoRoot = join(__dirname, "..");

/** Legacy deals container — must not reappear as an app/image default. */
const FORBIDDEN_ID = "GTM-PT2ZHD3W";

const SKIP_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
]);

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      out.push(...walkFiles(p));
    } else if (ent.isFile()) {
      out.push(p);
    }
  }
  return out;
}

function hitsInFile(abs: string): boolean {
  if (SKIP_EXT.has(extname(abs).toLowerCase())) return false;
  return readFileSync(abs, "utf8").includes(FORBIDDEN_ID);
}

function assertNoForbidden(label: string, paths: string[]): void {
  const hits = paths.filter(hitsInFile).map((p) => relative(repoRoot, p));
  assert(hits.length === 0, `${FORBIDDEN_ID} must be absent from ${label} (found: ${hits.join(", ")})`);
}

function main(): void {
  assertNoForbidden("app/", walkFiles(join(repoRoot, "app")));
  assertNoForbidden("lib/", walkFiles(join(repoRoot, "lib")));
  assertNoForbidden("Dockerfile", [join(repoRoot, "Dockerfile")]);
  assertNoForbidden(".env.example", [join(repoRoot, ".env.example")]);

  const gtm = readFileSync(join(repoRoot, "app", "components", "GoogleTagManager.tsx"), "utf8");

  assert(
    /export const GTM_ID\s*=\s*process\.env\.NEXT_PUBLIC_GTM_ID(?:\?\.trim\(\))?\s*(?:\|\||\?\?)\s*""/.test(
      gtm
    ),
    'GTM_ID is env-only with an empty-string fallback (|| "" or ?? "")'
  );
  assert(!/\|\|\s*["']GTM-/.test(gtm), 'GoogleTagManager.tsx has no || "GTM-…" fallback');

  const emptyGuards = gtm.match(/if\s*\(\s*!GTM_ID\s*\)\s*return\s+null/g) ?? [];
  assert(
    emptyGuards.length >= 2,
    "GoogleTagManager and GoogleTagManagerNoscript both return null when GTM_ID is empty"
  );
  assert(gtm.includes("function GoogleTagManager("), "GoogleTagManager script component is present");
  assert(
    gtm.includes("function GoogleTagManagerNoscript("),
    "GoogleTagManagerNoscript component is present"
  );

  console.log("OK: GTM env-only (no shipped container ID; empty = no script/noscript)");
}

main();
