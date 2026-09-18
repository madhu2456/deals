import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function getDatabaseUrl(): string {
  const base = process.env.DATABASE_URL || "file:./prisma/dev.db";
  if (base.includes("?")) {
    return `${base}&busy_timeout=10000&socket_timeout=10&connection_limit=1`;
  }
  return `${base}?busy_timeout=10000&socket_timeout=10&connection_limit=1`;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: getDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
