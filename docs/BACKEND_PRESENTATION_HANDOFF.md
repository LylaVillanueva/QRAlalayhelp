# QRAlalay backend handoff

**Audience:** frontend integration and presentation setup  
**Target:** Project B `jmzpqfgbjigbxkuofaae`  
**Status:** backend source and isolated tests are prepared; Project B is not deployed.

## Current verification

Previously recorded results for unchanged code:

- Supabase migration chain and pgTAP security/workflow tests: **135/135 assertions passed**.
- Edge Function request, authorization, and workflow checks: **22/22 passed**.
- Express tests: prior full suite **38/38**, plus barangay-contact tests **3/3**.
- Dependency audits: **0 vulnerabilities** in the latest recorded audits.

These were not rerun: Docker is unavailable, the Supabase CLI/access token is unavailable in this environment, and no backend source was changed in this continuation. Project A and Project B have not been modified.

## Default-privilege finding

The saved catalog query uses `COALESCE(n.nspname, '<global>')`. The captured CSV rows are all labeled `public`; the query also requested `<global>` and `qralalay`, and returned no rows for those scopes. The companion text that calls the six rows global is incorrect.

Supabase-managed `supabase_admin` defaults apply to objects it creates in `public`; they do not apply to QRAlalay objects created by the migration owner in `qralalay`. Do not try to alter `supabase_admin` defaults. QRAlalay application tables are in private schema `qralalay`; its schema access is restricted to `service_role`. The migration chain creates public RPCs with explicit per-function revokes and grants. The captured scope therefore does not establish cross-schema access to QRAlalay tables.

The hosted API's exposed-schema settings, current extension placement, and current grants still need an authenticated read-only check. Run the read-only query in `supabase/snippets/project_b_default_privilege_review.sql` after Project B access is restored.

An optional, owner-controlled hardening block is included in that snippet for review. It changes only defaults for future objects created by `postgres`, never `supabase_admin`; it is **not an active migration** and has not been applied. Test it against the exact Project B default ACLs in an isolated stack before promoting it to a timestamped migration. Existing public RPCs must keep their explicit required grants.

## Backend API contract

All Express routes below use the `/api` prefix. Authenticated requests use `Authorization: Bearer <accessToken>`. JSON requests use `Content-Type: application/json`.

| Workflow | Method and path | Body / access |
|---|---|---|
| Health | `GET /api/health` | No auth; returns 200 when the database is reachable, otherwise 503. |
| OTP request / verify | `POST /api/auth/send-otp`, `POST /api/auth/verify-otp` | `{channel: "email"|"phone", identifier}`; verify adds `otp` and `device: {deviceId, platform: "ios"|"android"|"web"}`. |
| Session | `POST /api/auth/refresh`, `POST /api/auth/logout` | Refresh: `{refreshToken}`; logout: optional `{deviceId}`. Refresh tokens rotate. |
| Bootstrap | `POST /api/auth/bootstrap` | One-time secret, barangay `{name, municipality, province}`, official `{fullName, phone? or email?}`. Requires configured `BOOTSTRAP_SECRET`; do not expose it to clients. |
| Resident registration | `POST /api/users/residents` | Official only. `{fullName, residentType?, dateOfBirth?, medicalNotes?, homeAddress?, guardianId? or newGuardian?}`. Do not send both guardian fields. |
| Guardian linking | `POST /api/users/guardians` | Official only. `{fullName, phone? or email?, residentIds?}`. |
| QR issuance | `POST /api/qr/generate` | Official only. `{residentId}`. |
| Public QR view | `GET /api/qr/:token/public-view` | No auth; allowlisted public fields only. |
| Assistance creation | `POST /api/incidents/create` or QR scan flow `POST /api/qr/:token/scan-event` | Authenticated direct case: `{residentId, latitude?, longitude?, notes?}`. Public scan flow has a cancellation capability. |
| Assignment | `POST /api/incidents/:incidentId/assign` | Official only. `{responderId}`. |
| Safety observation | `POST /api/incidents/:incidentId/confirmation` | Guardian or responder. `{decision: "safe"|"not_safe", summaryNotes?}`. Each role's confirmation is independent. |
| Responder report | `POST /api/incidents/:incidentId/resolve` | Assigned responder. `{finalActionSummary}`. A report does not itself close the case. |
| Case closure | `POST /api/incidents/:incidentId/close` | Official only. Closure checks required observations and report review. |
| Case reads/history | `GET /api/incidents/active`, `GET /api/incidents/:incidentId`, `GET /api/incidents/resident/:residentId`, `GET /api/audit-logs` | Authenticated, barangay/relationship/assignment scoped. |
| Account management | `/api/users/accounts` | Official only: GET/POST, PATCH `/:userId`, `/:userId/role`, `/:userId/status`. Create accepts `fullName, role, phone? or email?, position?, residentIds?, relationship?`. |
| Barangay contacts | `/api/users/barangay-contacts` | Authenticated GET; official PUT and POST `/:contactId/verification`. Contact is not usable as verified until an official confirms it. |
| Push token | `POST/DELETE /api/users/push-token` | Authenticated device registration/removal; delivery requires native Expo credentials and the worker. |

### Project B Supabase surface

Application tables stay in private `qralalay`; clients must use the approved public RPCs and Edge Functions, not direct table access. Supabase profile roles are `official`, `guardian`, `responder`, and `resident`; the legacy Express API names the first and third roles `barangay_official` and `barangay_responder`.

Edge Functions (all POST; successful responses are wrapped in `{data: ...}`):

- Public, rate limited: `public-qr-view` `{token}`; `submit-assistance-request` `{token, idempotencyKey, requestToken, locationToken, publicNote?, locationDescription?, latitude?, longitude?, accuracyMeters?}`; `cancel-assistance-request` `{requestToken}`; `public-assistance-status` `{requestToken}`; `location-share` `{action: "start"|"update"|"stop", locationToken, latitude?, longitude?, accuracyMeters?}`.
- Authenticated: `issue-qr-card` `{residentId}`; `invite-account` accepts `fullName, role, email?, phone?, position?, homeAddress?, wardIds?, relationship?`. The function rechecks the caller's active official role and barangay in the database.
- Internal only: `notification-worker`, POST with `x-worker-secret`. Never call it from the app.

Core protected workflow RPCs include resident/account invitation, QR issue/revoke, case assignment/reassignment, responder acceptance, safety observation, report submission, official closure, and case history. Use the migration definitions and tests as the source of truth for SQL argument names.

## Environment requirements

### Express compatibility backend

Required server-only values: `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (at least 32 bytes each outside development/test).

Optional values: `PORT` (4000), `TRUST_PROXY_HOPS`, `OTP_DEVELOPMENT_CODE`, `OTP_LENGTH`, `OTP_TTL_MINUTES`, `OTP_MAX_REQUESTS_PER_WINDOW`, `OTP_REQUEST_WINDOW_MINUTES`, `OTP_MAX_VERIFY_ATTEMPTS`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`, `EXPO_PUSH_ACCESS_TOKEN`, `WEB_DASHBOARD_ORIGIN`, `PUBLIC_WEB_ORIGIN`, `MOBILE_APP_BUNDLE_IDS`, `BOOTSTRAP_SECRET`, `QR_TOKEN_LENGTH_BYTES`, `QR_LEVEL_Q_ERROR_CORRECTION`, `INCIDENT_TIMEOUT_MINUTES`, `INCIDENT_GUARDIAN_GRACE_PERIOD_MINUTES`, `INCIDENT_CANCEL_WINDOW_MINUTES`, `INCIDENT_REPEAT_REPORT_NOTICE_MINUTES`, `GEOCODER_URL`, and `GEOCODER_USER_AGENT`.

Phone OTP delivery is not implemented in Express production. Email requires a configured Resend account/template. Never put `SUPABASE_SERVICE_ROLE_KEY`, database credentials, JWT secrets, or bootstrap secrets in the mobile app or website.

### Supabase clients and Edge Functions

Client builds receive only Project B URL and a publishable/anon key. Use `EXPO_PUBLIC_BACKEND_MODE=supabase` for the mobile client, plus `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; the website uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not place any secret key in either client.

Supabase injects its project URL and API keys into hosted functions. Set these application secrets for the Edge Functions: `RATE_LIMIT_PEPPER`, exact HTTPS `PUBLIC_WEB_ORIGINS`, HTTPS `PUBLIC_SITE_ORIGIN`, and high-entropy `NOTIFICATION_WORKER_SECRET`. Optional: `AUTH_INVITE_REDIRECT_URL`, `EXPO_ACCESS_TOKEN`. Keep values in a permission-restricted env file outside source control and use `supabase secrets set --env-file <secure-file> --project-ref jmzpqfgbjigbxkuofaae`.

## Startup and deployment

### Existing Express code

After an authorized operator creates a safe environment file for the intended database, from this directory:

```sh
npm run dev
```

The API listens on `PORT` (default 4000); health check is `GET /api/health`. Do not start Express against the current local credentials unless an operator verifies the database target. Do not use Project A for this deployment.

### Project B deployment — manual authorization required

The Supabase CLI is not on this shell's PATH and no CLI access token is present. Do not start the Docker-backed local stack while storage is low. An authorized Project B owner/operator must run these from `RESQR2` on a machine with the CLI. If the CLI is not installed, the official macOS install command is `brew install supabase/tap/supabase`; then:

```sh
supabase login
supabase link --project-ref jmzpqfgbjigbxkuofaae
supabase migration list --remote
```

The captured state says the foundation was manually applied but the remote migration ledger is empty. Reconfirm the foundation hash and remote object state first. Only with explicit approval to edit migration history, and only if the live check confirms exactly that state:

```sh
supabase migration repair --status applied 20261124171158 --remote
supabase migration list --remote
supabase db push --dry-run --remote
```

Review the printed target and pending migration list. This repair records history only; it does not execute the foundation SQL. A separate explicit approval is required before the hosted schema write:

```sh
supabase db push --remote
```

Do not pass `--yes`; verify the target is Project B and review the CLI prompt. Deploy Edge Functions only after the database push, required secrets, Auth delivery provider, and public website HTTPS origin are approved:

```sh
supabase functions deploy public-qr-view --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy submit-assistance-request --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy cancel-assistance-request --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy public-assistance-status --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy location-share --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy issue-qr-card --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy invite-account --project-ref jmzpqfgbjigbxkuofaae
supabase functions deploy notification-worker --project-ref jmzpqfgbjigbxkuofaae
```

Configure an approved email/SMS delivery provider, authorized first official account, private Realtime topics, and trusted scheduled invocation for `notification-worker`. Verify the barangay contact with authorized personnel; do not invent a hotline. Keep Express available until the Project B workflow passes acceptance testing and recovery is verified.

## Current blockers

- Docker API socket is missing; no local Supabase stack is running. Do not pull images with current low free space.
- Supabase CLI is not on PATH and no CLI access token file is present. Hosted read-only verification, migration repair, secrets, and deployment were not run.
- A working Express listener is not present at the configured local API address. The existing local Express environment targets a different Supabase project, not Project B; do not start it or write test/demo data there.
- No authorized Project B demo-account credentials or verified barangay hotline were supplied.

No Project A data has been migrated or synchronized. Project A must remain until Project B passes verified acceptance and recovery checks.
