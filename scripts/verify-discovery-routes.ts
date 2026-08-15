/**
 * Smoke-check discovery plain-text routes without a full Next server.
 * Run: pnpm exec tsx scripts/verify-discovery-routes.ts
 */
import { GET as securityGet } from "../app/.well-known/security.txt/route";
import { GET as humansGet } from "../app/humans.txt/route";
import robots from "../app/robots";

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

  mainRobots();

  console.log("OK: security.txt + humans.txt + robots AI citation policy");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
