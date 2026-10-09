-- F004: retain an append-only audit record for submitter erasure actions.
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "audit_events_action_createdAt_idx" ON "audit_events"("action", "createdAt");
