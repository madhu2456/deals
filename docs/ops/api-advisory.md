# API advisory disposition (F092)

**Property:** deals.madhudadi.in
**Status:** Not applicable to a public API contract.

This application has browser-facing route handlers under `/api/` for its own
site operations: CSP reports, deal click/report actions, and the internal
IndexNow verification route. They are not a versioned public API, do not expose
an OpenAPI contract, and are not intended for third-party integrations.
Consequently F092's public-API advisory is dispositioned as **N/A** rather than
inventing a wire contract or promising compatibility guarantees.

The routes remain boundary-validated and crawler-blocked by `app/robots.ts`.
Any future public integration must introduce an explicit versioned contract,
authentication/rate-limit policy, request/response schemas, and an API review
before being advertised as public.
