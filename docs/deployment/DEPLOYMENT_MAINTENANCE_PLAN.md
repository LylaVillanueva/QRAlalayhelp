# Deployment and maintenance plan

## Development and staging

Create a local Supabase project with synthetic data and versioned migrations. Keep separate mobile/web/API configs; never copy secrets into `EXPO_PUBLIC_*` variables or browser bundles. Validate RLS and function grants before connecting clients. Use Android development builds for native modules; Expo Go is not proof of native push behavior.

The public Vite site supports the legacy API path and the Supabase Edge Function path. A production deployment still needs the approved public HTTPS endpoint and matching Supabase configuration. The local placeholder-config build verifies bundling only; it does not establish a deployable endpoint or prove hosted integration. Do not substitute a dummy host for a release build.

## Operations required before live deployment

- Named service owner, budget and approved hosting/data residency arrangements.
- Secret manager, HTTPS, least privilege, secret rotation and incident response.
- Verified migration inventory, backup schedule, successful restore test and retention/deletion policy.
- Approved public disclosure, privacy notice, lawful basis, safeguarding and guardian verification procedures.
- Verified barangay and 911 help wording/contact behavior; operating hours/fallback must be truthful.
- Admin MFA and authorized first-official provisioning.
- Push credentials, outbox monitoring/retries and non-push fallback.
- Real Android/browser/device acceptance and accessibility evaluation.
- Documented support, outage, account recovery, breach and maintenance procedures.

No deployment, paid resource creation, public release or live data migration is authorized by this plan.
