# Edge Functions

Live CLI verification on 2026-11-26 found eight active functions on Project B. The hosted `issue-qr-card` remains the older v1 implementation; local `issue-qr-card` has been updated and `export-qr-card` is new and absent remotely. Both await the three-migration release sequence, required secret setup, and approval.

## Function groups

- Public, rate-limited: `public-qr-view`, `submit-assistance-request`, `public-assistance-status`, `cancel-assistance-request`, `location-share`.
- Authenticated: `issue-qr-card`, `export-qr-card`, `invite-account`.
- Worker-only: `notification-worker`, protected by its secret header.

Keep JWT verification enabled for authenticated functions. The worker is protected by its worker secret. Never deploy these functions with unreviewed `--no-verify-jwt` flags.

## Secrets

The live secret-name listing confirms `RATE_LIMIT_PEPPER`, `PUBLIC_WEB_ORIGINS`, `PUBLIC_SITE_ORIGIN`, and `NOTIFICATION_WORKER_SECRET`. `QR_CARD_ENCRYPTION_KEY_V1` is required by the updated QR functions and was absent during verification; add it once only if still absent at deployment time. Preserve all existing secrets. `EXPO_ACCESS_TOKEN` and `AUTH_INVITE_REDIRECT_URL` are optional and were absent. Secret values are never included in this status record.

Use Project B Edge Function Secrets for hosted values. For local function serving only, place test values in ignored `supabase/functions/.env`. Do not commit real secrets or use them in mobile/website builds.

See [API contracts](../../docs/api-contracts.md), [security](../../docs/security.md), and [deployment](../../docs/deployment.md).
