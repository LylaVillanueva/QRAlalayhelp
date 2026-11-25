# Edge Function configuration

These functions are local source only; they have not been deployed. Do not put service keys in mobile or website environment files.

## Runtime settings

Hosted Supabase supplies the project URL and API keys to Edge Functions. The current runtime exposes the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names used by this code. Do not try to create custom secrets whose names begin with `SUPABASE_`; that prefix is reserved. The service-role key must stay server-side and must never enter a mobile or website build. See [Supabase Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).

Set these application secrets in Project B after deployment is approved:

- `RATE_LIMIT_PEPPER` (random high-entropy secret)
- `PUBLIC_WEB_ORIGINS` (comma-separated exact HTTPS origins; no wildcard)
- `PUBLIC_SITE_ORIGIN` (single HTTPS public website origin for QR URLs)
- `NOTIFICATION_WORKER_SECRET` (send only as `x-worker-secret`)
- `AUTH_INVITE_REDIRECT_URL` (optional allowlisted HTTPS app invitation callback)
- `EXPO_ACCESS_TOKEN` (optional Expo push service credential)

For local Edge Function serving, put test-only values in the ignored `supabase/functions/.env`; do not commit real secrets. Hosted secrets can be set from a permission-restricted file with `supabase secrets set --env-file <secure-file> --project-ref <project-ref>`.

The notification worker must be invoked by a trusted scheduled service using POST. It claims push rows, checks provider receipts, deletes expired temporary coordinates, and prunes stale rate-limit hashes. Do not expose the worker secret to clients. Configure a supported Supabase Cron/HTTP schedule only after deployment and secrets are set.

## Function responsibilities

- Public, rate limited: `public-qr-view`, `submit-assistance-request`, `cancel-assistance-request`, `public-assistance-status`, and `location-share`.
- Authenticated: `issue-qr-card` and `invite-account`; the latter rechecks the caller's active official profile inside the database transaction.
- Internal: `notification-worker`, protected by the worker secret and server credentials.

The database migration gives `service_role` access only to the server-side RPCs. Public request tokens and QR tokens are generated with Web Crypto and stored as SHA-256 hashes. Public responses contain no profile, resident address, guardian identity, or case UUID. Live coordinates are visible only through the authenticated case query, are limited to an active unexpired share, and are erased on stop, official closure, cancellation, or scheduled expiry cleanup.
