/**
 * Smoke-check discovery plain-text routes without a full Next server.
 * Run: pnpm exec tsx scripts/verify-discovery-routes.ts
 */
import { GET as securityGet } from "../app/.well-known/security.txt/route";
import { GET as humansGet } from "../app/humans.txt/route";
import { GET as pricingGet } from "../app/pricing.md/route";
import { GET as aiProfileGet } from "../app/ai-profile.json/route";
import { GET as indexnowGet } from "../app/api/indexnow/route";
import { NextRequest } from "next/server";
import robots from "../app/robots";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function ruleAgents(rule: { userAgent?: string | string[] }): string[] {
  const ua = rule.userAgent;
  if (ua == null) return [];
  return Array.isArray(ua) ? ua : [ua];
}

function mainRobots() {
  const { rules } = robots();
  const list = Array.isArray(rules) ? rules : rules ? [rules] : [];

  const citationBots = [
    "Perplexity-User",
    "Claude-SearchBot",
    "Claude-User",
    "Claude-Web",
  ];
  for (const bot of citationBots) {
    const rule = list.find((r) => ruleAgents(r).includes(bot));
    assert(rule, `robots missing rule for ${bot}`);
    assert(rule.allow === "/" || (Array.isArray(rule.allow) && rule.allow.includes("/")), `${bot} should allow /`);
    assert(rule.disallow !== "/", `${bot} must not disallow /`);
  }

  const trainingBlocked = [
    "GPTBot",
    "ClaudeBot",
    "anthropic-ai",
    "CCBot",
    "Applebot-Extended",
    "Bytespider",
  ];
  for (const bot of trainingBlocked) {
    const rule = list.find((r) => ruleAgents(r).includes(bot));
    assert(rule, `robots missing block rule for ${bot}`);
    const dis = rule.disallow;
    const blocked =
      dis === "/" ||
      (Array.isArray(dis) && dis.includes("/")) ||
      dis === "/*" ||
      (Array.isArray(dis) && dis.includes("/*"));
    assert(blocked, `${bot} should disallow /`);
  }

  // D3: the catch-all group must also fence off admin + API for every
  // crawler that is not named above (Bingbot, Yandex, …).
  const starRule = list.find((r) => ruleAgents(r).includes("*"));
  assert(starRule, "robots has a * catch-all rule");
  const starDis = starRule.disallow;
  const starDisList = Array.isArray(starDis) ? starDis : starDis ? [starDis] : [];
  for (const path of ["/admin", "/api"]) {
    assert(
      starDisList.some((d) => d === path || d === `${path}/`),
      `robots * rule disallows ${path} (got [${starDisList.join(", ")}])`,
    );
  }
}

/** D3: pin the twitter card metadata in the root layout source. */
function mainTwitterMeta() {
  const layoutSrc = readFileSync(join(repoRoot, "app", "layout.tsx"), "utf8");
  assert(
    /card:\s*"summary_large_image"/.test(layoutSrc),
    "layout twitter card is summary_large_image",
  );
  const siteHandle = layoutSrc.match(/twitter:\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert(
    /site:\s*"@(?:madhu245)"/.test(siteHandle),
    "layout twitter metadata declares the site handle",
  );
}

async function main() {
  const sec = await securityGet();
  assert(sec.status === 200, `security.txt status ${sec.status}`);
  assert(
    (sec.headers.get("Content-Type") || "").includes("text/plain"),
    "security.txt content-type",
  );
  const secText = await sec.text();
  assert(secText.includes("Contact: mailto:hello@madhudadi.in"), "security contact");
  assert(secText.includes("Canonical:"), "security canonical");
  assert(secText.includes("Expires:"), "security expires");
  assert(secText.includes("Deals by Madhu Dadi"), "security brand");

  const hum = await humansGet();
  assert(hum.status === 200, `humans.txt status ${hum.status}`);
  assert(
    (hum.headers.get("Content-Type") || "").includes("text/plain"),
    "humans content-type",
  );
  const humText = await hum.text();
  assert(humText.includes("/* TEAM */"), "humans TEAM");
  assert(humText.includes("/* SITE */"), "humans SITE");
  assert(humText.includes("Madhu Dadi"), "humans author");
  assert(humText.includes("en-IN"), "humans locale");
  assert(humText.includes("Deals by Madhu Dadi"), "humans brand");

  const pricing = await pricingGet();
  assert(pricing.status === 200, `pricing.md status ${pricing.status}`);
  assert(
    (pricing.headers.get("Content-Type") || "").includes("text/markdown"),
    "pricing.md content-type",
  );
  const pricingText = await pricing.text();
  assert(pricingText.includes("Madhu Dadi"), "pricing.md author");
  assert(pricingText.includes("https://madhudadi.in/"), "pricing.md hub identity");
  assert(/free/i.test(pricingText), "pricing.md free directory");
  assert(pricingText.includes("Deals by Madhu Dadi"), "pricing.md brand");

  const aiProf = await aiProfileGet();
  assert(aiProf.status === 200, `ai-profile.json status ${aiProf.status}`);
  const aiData = await aiProf.json();
  assert(
    Array.isArray(aiData.relatedProfiles) && aiData.relatedProfiles.length === 4,
    "ai-profile.json relatedProfiles contains 4 URLs",
  );
  assert(
    aiData.relatedProfiles.every(
      (u: unknown) => typeof u === "string" && u.startsWith("https://") && u.endsWith("/ai-profile.json"),
    ),
    "ai-profile.json relatedProfiles valid URLs",
  );

  // IndexNow verification endpoint
  process.env.INDEXNOW_KEY = "test-indexnow-key-12345";
  const inReqValid = new NextRequest("https://deals.madhudadi.in/api/indexnow?key=test-indexnow-key-12345");
  const inResValid = await indexnowGet(inReqValid);
  assert(inResValid.status === 200, `indexnow valid key status ${inResValid.status}`);
  const inTextValid = await inResValid.text();
  assert(inTextValid === "test-indexnow-key-12345", "indexnow valid key body matches");

  const inReqUpper = new NextRequest("https://deals.madhudadi.in/api/indexnow?key=TEST-INDEXNOW-KEY-12345");
  const inResUpper = await indexnowGet(inReqUpper);
  assert(inResUpper.status === 200, `indexnow uppercase key status ${inResUpper.status}`);
  const inTextUpper = await inResUpper.text();
  assert(inTextUpper === "test-indexnow-key-12345", "indexnow uppercase key body matches");

  const inReqInvalid = new NextRequest("https://deals.madhudadi.in/api/indexnow?key=wrong-key-12345");
  const inResInvalid = await indexnowGet(inReqInvalid);
  assert(inResInvalid.status === 404, `indexnow wrong key status ${inResInvalid.status}`);

  mainRobots();
  mainTwitterMeta();

  console.log("OK: security.txt + humans.txt + pricing.md + robots AI citation policy + ai-profile.json + robots * admin/api fence + twitter card meta");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
