# Historical Express deployment readiness

This guide applies only to the retained Express fallback. Project B's active deployment steps are in `../../../docs/deployment.md`. Do not use the Express settings to configure the mobile or website Supabase clients.

The repository has app and API code, but deploying the current setup does not by itself make the service ready for real residents. Work through these items before handling production personal or emergency data.

## Required before production

- Put API and database credentials in the hosting provider's secret manager. Never ship Supabase service-role keys, database URLs, or JWT signing secrets in the mobile app or public website.
- Replace any credentials that were previously committed, pasted into a shared document, or exposed in an example file. Removing a credential from the current tree does not revoke it.
- Set `NODE_ENV=production`, use different random access and refresh JWT secrets of at least 32 bytes, and configure the real HTTPS origins for `WEB_DASHBOARD_ORIGIN` and `PUBLIC_WEB_ORIGIN`.
- Set `TRUST_PROXY_HOPS` to the exact number of trusted reverse proxies in front of the API. Do not trust forwarded IP headers from clients.
- Configure a real Resend account and the `sign-up-confirmation` template before allowing email OTP login. The API intentionally fails closed if email delivery is not configured.
- Phone OTP is unavailable in production until a real SMS provider is implemented and wired into `sendSmsOtp`. An API key alone does not enable SMS delivery.
- Set a long random `BOOTSTRAP_SECRET`, use it once to provision the first official, then remove it from the deployment environment. Apply all database migrations before starting the API.
- Verify database backups, restore procedures, least-privilege project access, private photo bucket settings, and data-retention periods for OTPs, audit logs, location, and resident records.
- Review the privacy disclosure for emergency coordinates sent to the configured reverse-geocoding provider, and use an approved provider if external processing is not acceptable.
- Configure Expo production credentials and push access if push alerts are part of the operational workflow. Push delivery is best-effort, so define a fallback for urgent alerts.
- Run the full application through a staging deployment with real iOS and Android builds, real email delivery, database migrations, QR scans, geolocation, incident escalation, and recovery after process/database restarts.

## Deployment shape

Use one API instance until the timeout engine and rate limits are moved to shared/distributed infrastructure. The incident timeout engine is in-process, and the public HTTP rate limiter uses in-memory storage; multiple API instances can run duplicate jobs and have per-instance limits. Keep the database on verified TLS and restrict network access to the API host.

The public QR page discloses a resident's first name, barangay, and medical notes to anyone holding an active QR link. Review the wording and obtain the required consent for the intended thesis/pilot population before printing cards.
