/**
 * Secret-scanner self-test (F-DEAL-015): verifies that
 * scripts/verify-no-secrets.sh detects ADMIN_SECRET / ADMIN_PASSWORD /
 * ADMIN_USERNAME / INDEXNOW_KEY on a planted fixture (real-looking values →
 * exit 1 with the right redacted labels) and treats placeholder values as
 * clean (exit 0). Runs entirely on temp files — never touches real
 * credentials or the repo tree.
 *
 * Also asserts the tracked .env.example stays scanner-clean so the tree mode
 * used in CI (bash scripts/verify-no-secrets.sh --tree) cannot regress.
 *
 * Run: pnpm test:secret-scanner
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");
const SCANNER = join(repoRoot, "scripts", "verify-no-secrets.sh");

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function runScan(target: string): { status: number; output: string } {
  try {
    const stdout = execFileSync("bash", [SCANNER, "--scan", target], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

function main(): void {
  const workDir = mkdtempSync(join(tmpdir(), "deals-secrets-"));
  try {
    // Real-looking values (redacted in scanner output — only labels are printed).
    // The fixture lines are stored base64-encoded and decoded at runtime so the
    // repo's own scanner cannot flag this self-test in --staged/--tree mode:
    // the base64 alphabet contains none of the `_`/`-`/`!` characters the four
    // admin/indexnow patterns key on, so no secret-looking literal exists here.
    const b64dec = (s: string): string => Buffer.from(s, "base64").toString("utf8");
    const bad = join(workDir, "fixture-bad.env");
    writeFileSync(
      bad,
      [
        b64dec("QURNSU5fU0VDUkVUPSJhMWIyYzNkNGU1ZjZhN2I4YzlkMGUxZjJhM2I0YzVkNmU3ZjhhOWIwYyI="),
        b64dec("QURNSU5fUEFTU1dPUkQ9SHVudGVyMiFYeVo="),
        b64dec("QURNSU5fVVNFUk5BTUU9TWFkaHVBZG1pbjIwMjY="),
        b64dec("SU5ERVhOT1dfS0VZPTM2N2RkNmNmNWJhNTFkOTkzMjI4Yzk3Y2M5Yzk0ODMw"),
        "",
      ].join("\n")
    );
    const badResult = runScan(bad);
    assert(
      badResult.status === 1,
      `fixture with real-looking secrets → exit 1 (got ${badResult.status})`
    );
    for (const label of ["admin-secret", "admin-password", "admin-username", "indexnow-key"]) {
      assert(badResult.output.includes(`pattern=${label}`), `detected label: ${label}`);
    }

    // Placeholder values (mirror .env.example conventions) must stay clean.
    const clean = join(workDir, "fixture-clean.env");
    writeFileSync(
      clean,
      [
        'ADMIN_SECRET="replace-this-with-a-long-random-secret-at-least-32-chars"',
        'ADMIN_PASSWORD="change-me-in-production"',
        'ADMIN_USERNAME="admin"',
        'INDEXNOW_KEY="change-me-32-hex-chars"',
        "",
      ].join("\n")
    );
    const cleanResult = runScan(clean);
    assert(
      cleanResult.status === 0,
      `placeholder fixture → exit 0 (got ${cleanResult.status})\n${cleanResult.output}`
    );

    // The tracked template must never trip tree mode (CI gate).
    const example = join(repoRoot, ".env.example");
    const exampleResult = runScan(example);
    assert(
      exampleResult.status === 0,
      `.env.example → exit 0 (got ${exampleResult.status})\n${exampleResult.output}`
    );

    // Dockerfile build-time placeholders (ENV ADMIN_*="build"/"build-time-…")
    // must also stay clean — a real value there would trip the tree scan.
    const dockerfile = join(repoRoot, "Dockerfile");
    const dockerfileResult = runScan(dockerfile);
    assert(
      dockerfileResult.status === 0,
      `Dockerfile → exit 0 (got ${dockerfileResult.status})\n${dockerfileResult.output}`
    );

    console.log(
      "OK: verify-no-secrets.sh patterns (ADMIN_SECRET, ADMIN_PASSWORD, ADMIN_USERNAME, INDEXNOW_KEY)"
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
