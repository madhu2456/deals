# DSR submitter erasure

Owner: Deals site operator (the administrator who controls `ADMIN_*` credentials).

## Primary path

Because this directory is single-tenant and submitters do not have accounts, the
operator handles a verified request from the admin dashboard. Sign in at `/admin`
and invoke the submitter anonymization action with the email address supplied in
the request. The action requires the admin session, matches all stored submitter
emails case-insensitively, and replaces both `submittedByEmail` and
`submittedByName` with deterministic redaction values. It writes an audit event
in the same database transaction. Public routes and unauthenticated callers
cannot invoke this action.

## Manual fallback and SLA

A requester should email `hello@madhudadi.in` with the address used for the deal
submission and enough context to identify the request. The operator verifies
control of the address (reply to a confirmation message or provide equivalent
reasonable evidence) before acting. Acknowledge and complete the erasure within
30 days, or sooner where practical; escalate unusual identity or legal conflicts
to the operator before changing data. Do not include the original email in
routine logs or audit metadata.

## Scope, backups, and caches

The action covers every `Deal` row matching the verified email, including pending,
approved, rejected, and expired rows. It does not delete the deal itself or
unrelated merchant content. SQLite backups are encrypted and retained according
to the [backup and restore runbook](backup-restore.md); the operator records the
request and backup-expiry follow-up in the restricted operations log, and does
not rewrite historical backups outside the documented retention/restore process.
Any restored backup containing the original value must be reprocessed after
restore. Purge or invalidate application/CDN caches for affected deal pages and
admin responses after completion; public deal pages must not expose submitter
fields. The audit record contains only the redacted subject and affected-row
count.
