import { createHash, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "admin-session";
const DEFAULT_TTL_HOURS = 24;

function getSecret() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

function getCredentials() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be configured");
  }
  return { username, password };
}

/**
 * Constant-time string compare via SHA-256 digests so length differences
 * do not short-circuit (timingSafeEqual requires equal-length buffers).
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/** JWT + cookie max-age hours from ADMIN_JWT_TTL_HOURS (default 24). */
function getJwtTtlHours(): number {
  const raw = process.env.ADMIN_JWT_TTL_HOURS;
  if (raw === undefined || raw === "") return DEFAULT_TTL_HOURS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(
      `[admin-auth] invalid ADMIN_JWT_TTL_HOURS="${raw}", using ${DEFAULT_TTL_HOURS}`,
    );
    return DEFAULT_TTL_HOURS;
  }
  // Cap at 30 days to avoid accidental multi-year sessions
  return Math.min(n, 24 * 30);
}

export async function loginAdmin(username: string, password: string) {
  const creds = getCredentials();
  const userOk = safeEqual(username, creds.username);
  const passOk = safeEqual(password, creds.password);
  if (!userOk || !passOk) {
    return { success: false, error: "Invalid credentials" };
  }

  const ttlHours = getJwtTtlHours();
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlHours * 60 * 60,
  });

  return { success: true };
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== "admin") return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
}
