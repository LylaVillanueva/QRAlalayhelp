# Current system audit

Audit date: 2026-11-24 (Asia/Manila). Scope: files available in the workspace; no production database, third-party account, or live resident data was accessed.

## Workspace and source control

- `QRAlalay-Mobile/` is a Git repository on `main`, three commits behind `origin/main`, with a large local working tree: current API/auth/data/UI edits, untracked photo/avatar/map components, and deleted old `src/` paths alongside current root-level equivalents. The current diff reports 113 changed paths, 458 insertions, and 8,650 deletions; many paths appear to be a source-layout move and require rename-level review before commit.
- A source-only recovery archive was created at `/private/tmp/qralalay-mobile-pre-migration.tar.gz`. It excludes `.git`, `.env`, device metadata, dependencies, and macOS metadata. It preserves the working files, but not Git history.
- `QRAlalay-Web/` is a separate Git repository on `main`, clean at audit time.
- `QRAlalay-Backend/` has no nested `.git`; Git lookup from that directory resolves to a parent outside this workspace. Do not use that parent repository for changes or commits. Treat the API directory as source-only until a safe repository boundary is established.
- Root `app/` is an independent Android starter, not the Expo application.
- At the initial audit, no local `supabase/` project or Supabase CLI was present. After the audit, an isolated local Supabase project was initialized using the CLI through `npx`; no hosted project was linked. The later local schema inspection and tests are recorded below. No `.env` values or generated local keys are included in this report.

## Current architecture

- Mobile: Expo SDK 57, React Native 0.86, JavaScript, React Navigation native stack, SecureStore, Expo Camera/Location/Notifications and API client targeting QRAlalay-Backend. SDK 57 versioned documentation was read before any source change in this migration.
- Public site: React 18 + Vite 8 JavaScript project, with a production build guard requiring a non-local HTTPS `/api` endpoint and a restrictive CSP.
- API: Node.js/TypeScript/Express/PostgreSQL on Supabase infrastructure, JWT/refresh-token sessions, Zod validation, RBAC, rate limiting, audit writes, Socket.IO rooms and in-process timeout engine.
- Database source: 16 forward SQL migrations; current documented schema includes incidents plus topic tables, users/residents, QR tokens, OTP/session/push records, and audit logs. Migrations are source history; deployed state was not verified.

## Existing functionality found

Mobile role modules cover officials, guardians and responders. Public QR pages support QR lookup and bystander alert submission. API routes cover auth/bootstrap, accounts, profile/resident data, QR, incident lifecycle, dashboards, audit logs and push-token registration. API services include photo signing, geocoding, notifications, incident policy, audit and realtime behavior.

Existing safety corrections and known gaps are described in `APP_FLOW_AUDIT.md`; that historical audit remains useful but is not the v3.0 target specification. The v3.0 system design changes the purpose to community assistance/reunification and requires independent Call Barangay and Call 911 pathways.

## Baseline checks (executed 2026-11-24)

| Check | Result |
|---|---|
| Mobile `npm test` | 13 tests; 10 passed, 3 failed. Failures: incident location mapping expects the previous landmark field; guardian/responder data loading expects a profile method absent from the test client; official load test similarly fails with the changed client contract. |
| API `npm test` | 36 tests; 35 passed, 1 failed. QR revocation boundary test reached a real PostgreSQL pool path; sandbox denied the connection (`EPERM`), so the expected not-found behavior was not exercised. No escalation or live DB connection attempted. |
| API `npm run typecheck` | Passed. |
| API `npm run build` | Passed. Build regenerated ignored `QRAlalay-Backend/dist/` output. |
| Website `npm run build` | Blocked by configuration: local `VITE_API_BASE_URL` resolves to localhost; production build correctly refuses to bundle a site pointing to localhost. No fake public endpoint was substituted. |
| Expo Android/iOS/web export | Not rerun during this audit. |
| Visual screenshots | Not captured. |

## Sensitive configuration handling

Environment files were not opened or copied into reports/checkpoints. Only variable names in `.env.example` were inventoried. The existing mobile/API/web `.env` values must remain local; do not migrate or commit them. Any real credentials must be rotated if prior sharing or commits are confirmed by the project owners.

## Follow-up implementation and verification (2026-11-24)

- Initialized `QRAlalay-Backend/supabase/` with an isolated native local stack. The stack was not linked to a hosted project.
- Applied all 16 existing API migrations to an empty local database, then created `supabase/migrations/20261124170000_legacy_schema_baseline.sql` as a schema-only baseline. Its embedded migration history was checked against all 16 source checksums.
- Inspected the resulting legacy schema: 17 base tables and the `incident_details` view. Six legacy tables initially had RLS enabled, with no policies found. `anon` and `authenticated` had no SELECT table privilege on the legacy objects checked.
- Added `supabase/migrations/20261124171000_target_core_schema.sql` for target profiles, barangay contacts, guardian links, digest-only QR cards, assistance cases, assignments, observations, reports, events, device tokens, notifications, and an outbox. The migration enables RLS for the legacy base tables and enables/forces RLS for the 12 new core tables. Client privileges are limited to selected self-profile, assigned barangay, and approved public contact reads. Case and resident mutation paths remain server-only and are not yet implemented.
- Added structural and synthetic row-level pgTAP tests. All 21 structural checks and five row-level checks pass locally. These cover broad legacy/private-table privilege denials as well as synthetic active, disabled, cross-barangay, and public-contact behavior. Synthetic rows are rolled back by each test transaction.
- Replayed the database from scratch using `supabase db reset --no-seed`; the legacy runner then recognized all 16 original migrations as already applied.
- Fixed the current mobile data test fixtures to match the live `scan_address` and `getMyProfile()` contracts and the current coordinate display. Fixed the backend QR revocation test to isolate `withTransaction` through a mocked pool connection instead of relying on a PostgreSQL socket.
- Corrected the legacy public QR lookup response to select and return only QR status, resident active status, and barangay name. It now rejects inactive residents. Removed first-name and medical-note rendering from both public QR screens, removed internal incident IDs and the unnecessary dial-number field from the public scan result, and made the 911 link independent of scanning or submitting a request. Updated public confirmation wording to report request registration without implying that assistance has arrived.
- Follow-up test results: mobile 14/14 passed, API 38/38 passed, API typecheck and build passed, pgTAP 26/26 passed. Android and Expo web JavaScript exports passed, including after adding platform-specific session storage and public QR changes. The separate Vite website build remains blocked by its localhost API environment setting; physical-device and visual checks remain unavailable.
- The target schema has not been connected to the mobile app or legacy API. No real identities, resident records, or incident records were backfilled. No production database, deployment, or real emergency call was used.
- A source review of `QRAlalay-Mobile/lib/supabase.js` found that its Supabase client had used AsyncStorage for persisted sessions; no application callsites for that client were found. It now uses a native SecureStore adapter on Android/iOS and a web-specific AsyncStorage adapter. This is a storage prerequisite only; app sign-in and Supabase Auth are not integrated. The local `.env` was not opened, so the value/type of its public key was not independently confirmed; the client must only receive a publishable/anon key, never a service-role key. Expo SDK 57 documents platform persistence differences and possible payload-size limits, so physical-device session lifecycle testing remains required.
- `QRAlalay-Mobile` Android and web JavaScript exports both passed after the current folder reorganization, confirming the exported entrypoint resolves. These exports do not establish a signed Android build, runtime/device behavior, or visual parity.

## Updated clean-database direction (2026-11-25)

The user clarified that current database contents are fictional testing data only and instructed a clean target-schema implementation with no legacy row migration. Accordingly, the previous schema-only legacy baseline and target migration that included legacy tables/QR hash backfill have been moved to `QRAlalay-Backend/supabase/legacy_reference/`. Their old pgTAP tests were moved with them. The files are preserved for reference but are not in the active Supabase migration/test directories.

The requested `001_qralalay_foundation.sql` was not found in the workspace or supplied attachments. No substitute schema has been invented. The current local database still reflects the prior local-only schema and must not be treated as the clean target. It can be rebuilt with synthetic data after the approved foundation migration is available. No production/hosted project was linked, no legacy test rows were imported, and no database reset has been run under the updated direction.
