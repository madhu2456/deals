-- AlterTable (F-DEAL-006): user "broken deal" reports on the Deal row.
ALTER TABLE "deals" ADD COLUMN "brokenReportedAt" DATETIME;
ALTER TABLE "deals" ADD COLUMN "brokenReportCount" INTEGER NOT NULL DEFAULT 0;
