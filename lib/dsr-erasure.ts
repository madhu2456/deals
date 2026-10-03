import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for a syntactically valid, length-bounded submitter email. */
export function isValidDsrEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim().toLowerCase();
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

/**
 * Deterministic redaction: the same email always maps to the same digest, so a
 * repeat request is idempotent and the audit subject stays correlatable without
 * ever storing the original value. No product/identity PII is derivable from
 * the 16-hex-char truncated SHA-256.
 */
export function redactionFor(email: string): { email: string; name: string } {
  const digest = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return {
    email: `redacted-${digest}@invalid.local`,
    name: `Redacted Submitter ${digest}`,
  };
}

/**
 * F004: anonymize every Deal row whose stored submitter email matches
 * (case-insensitive) the given address. The update and its audit event commit
 * in one transaction so a crash can never erase data without a record, or
 * record an erasure that did not happen. Returns the affected-row count.
 */
export async function anonymizeSubmitterByEmail(
  submittedByEmail: string
): Promise<{ count: number; email: string; name: string }> {
  const email = submittedByEmail.trim().toLowerCase();
  const redaction = redactionFor(email);

  return prisma.$transaction(async (tx) => {
    // SQLite is ASCII-case-insensitive for LIKE but Prisma's `mode:
    // "insensitive"` is unsupported; fetch submitter rows and normalize in
    // memory so mixed-case duplicates are never missed.
    const candidates = await tx.deal.findMany({
      where: { submittedByEmail: { not: null } },
      select: { id: true, submittedByEmail: true },
    });
    const matchingDeals = candidates.filter(
      (deal) => deal.submittedByEmail?.trim().toLowerCase() === email
    );

    if (matchingDeals.length > 0) {
      await tx.deal.updateMany({
        where: { id: { in: matchingDeals.map(({ id }) => id) } },
        data: {
          submittedByEmail: redaction.email,
          submittedByName: redaction.name,
        },
      });
    }

    await tx.auditEvent.create({
      data: {
        action: "DSR_SUBMITTER_ANONYMIZE",
        subject: redaction.email,
        metadata: JSON.stringify({ dealCount: matchingDeals.length }),
      },
    });

    return { count: matchingDeals.length, ...redaction };
  });
}
