# Baseline test and build results

Run date: 2026-11-24. These are baseline results before any migration code changes. A failure is not reclassified as a pass based on an assumption.

| Command | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | 10/13 passed | 3 failures expose mismatch between current incident mapping/data loader and existing tests. Exact failures are recorded in `docs/migration/CURRENT_SYSTEM_AUDIT.md`. |
| `RESQR2: npm test` | 35/36 passed | One QR revocation boundary test attempted a PostgreSQL connection and sandbox returned `EPERM`; no remote database escalation or mutation was attempted. Test isolation must be repaired before it can establish the intended not-found behavior. |
| `RESQR2: npm run typecheck` | Passed | `tsc --noEmit`. |
| `RESQR2: npm run build` | Passed | TypeScript build; regenerated ignored `dist/`. |
| `RESQR-Web: npm run build` | Blocked by environment config | Production safety correctly rejects local localhost `VITE_API_BASE_URL`. No placeholder public endpoint supplied. |
| Expo platform exports | Not run | Prior October audit records successful exports; that is historical evidence only. |
| Database migration/RLS tests | Not run | No isolated Supabase project or CLI configured; production database untouched. |
| Physical device/accessibility/visual tests | Not run | No device session or screenshots. |

## Regression scenarios required by target report

Keep and extend tests for authorization, disabled accounts, guardian relationship revocation, QR revocation and allowlists, anonymous idempotent requests, location denial, concurrent assignment, accept/decline/reassignment, independent observations, no automatic closure, required report/outcome, cancellation ownership, notification failure/retry, offline Call Barangay, unauthenticated Call 911, dynamic text/TalkBack, public field inspection, backup restore and safeguarding exceptions. Calls must use a controlled test number or stop at the dialer; do not complete calls to 911.

## Verification before the clean-schema instruction

Run date: 2026-11-24. These checks used the earlier legacy-derived local schema and synthetic/empty data. On 2026-11-25 the migration direction changed to a clean schema; the legacy-derived migrations and pgTAP tests were archived. These database results are historical and do not verify the new foundation schema. Mobile/API tests remain relevant to the source fixes they cover.

| Command | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **14/14 passed** | Updated incident and profile fixtures to current contracts; added a SecureStore adapter unit test covering reads, writes, deletes, and propagated storage failures. |
| `RESQR2: npm test` | **38/38 passed** | QR revocation is transaction-isolated. Public QR tests verify lookup field allowlisting, inactive-resident rejection, and omission of internal incident IDs from public scan results. |
| `RESQR2: npm run typecheck` | **Passed** | Re-run after the backend test change. |
| `npx --yes supabase test db` | **26/26 pgTAP checks passed** | 21 structural grant/RLS/constraint checks plus 5 synthetic row-level checks for active, disabled, cross-barangay, and anonymous contact reads. This does not cover all functions or all target-table workflows. |
| `npx --yes supabase db reset --no-seed` | **Passed** | Replayed the schema baseline and target core migration against the isolated local database. |
| `DATABASE_URL=YOUR_LOCAL_TEST_DATABASE_URL npm run migrate` | **Passed** | The legacy runner reported all 16 source migrations as already applied; it did not replay them over the target schema. |
| `RESQR2: npm run build` | **Passed** | Rebuilt the TypeScript API after test isolation changes. |
| `RESQR-Mobile: ./node_modules/.bin/expo export --platform android --output-dir /private/tmp/qralalay-export-android` | **Passed** | Re-run after SecureStore and public QR changes; Android JavaScript bundle resolved 1,596 modules. This is not a signed/native Android app build or device test. |
| `RESQR-Mobile: ./node_modules/.bin/expo export --platform web --output-dir /private/tmp/qralalay-export-web` | **Passed** | Re-run after platform-specific storage and public QR changes; web bundle resolved 1,054 modules. This is the Expo app's web export, not the separate Vite public QR site. |
| `RESQR-Web: npm run build` | **Blocked by environment config** | Re-run after the QR page privacy change; its build guard rejects `VITE_API_BASE_URL=http://localhost:4000/api`. No placeholder public endpoint was substituted. |
| React JSX parse of `RESQR-Web/src/ScanPage.jsx` | **Passed** | Babel parser accepted the changed JSX. This is only a syntax check; Vite production bundling remains blocked as above. |

The local database checks used synthetic fixtures inside rollback-only test transactions. No hosted or production database, real resident data, phone call, or deployment was used. RLS and grants are verified for the specific assertions listed above; protected database functions, Edge Functions, Storage policies, full workflow authorization, and concurrency remain unimplemented or unverified.

## Continuation results — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| `supabase start --workdir /private/tmp/qralalay-supabase-isolated` | Passed | Started only the disposable Docker-backed local copy. Final reset applied all nine active migrations in order. |
| `supabase test db --workdir /private/tmp/qralalay-supabase-isolated` | **73/73 pgTAP assertions passed** | Final chain: nine active migrations. Security: 49 assertions. Workflow: 24, including synthetic resident date-of-birth, account contact fields, invitation metadata, case transitions, and public projection. Test transactions rolled back. |
| Local Edge Function HTTP checks | **12/12 passed** | Validated public request input, invitation field limits, authenticated QR issuance rejection, worker secret requirement, allowed/disallowed origins, and Supabase gateway preflight. |
| Public Edge Function happy path | **7/7 passed** | Synthetic local QR lookup, allowlisted response, request creation, idempotent retry, capability-scoped status, start/update/stop location, post-stop denial, requester cancellation, and status after cancellation. All synthetic Auth-free fixture rows and rate-limit state were removed afterward. |
| Authenticated Edge Function happy paths | **2/2 passed** | Synthetic Auth official issued a QR card and invited a responder with position/address fields. Synthetic Auth, profile, resident, QR, audit, and invitation rows were removed; a follow-up catalog count returned zero for all fixture IDs/emails. |
| `RESQR2: npm test` | **38/38 passed** | Express business-rule tests still pass; Express remains available and default. |
| `RESQR-Mobile: npm test` | **14/14 passed** | Existing mobile session, data mapping, role-load, and notification tests. |
| Expo 57 Android export, Supabase mode | Passed | JavaScript bundle completed with 1,643 modules; public placeholder URL/key used, no hosted calls. Not a native signed build or device run. |
| Expo 57 web export, Supabase mode | Passed | JavaScript bundle completed with 1,098 modules; public placeholder URL/key used, no hosted calls. |
| `RESQR-Web: npm run build` | Passed | Vite production build completed using a placeholder public Supabase URL/key. |
| Backend, mobile, nested Vite web, and standalone website `npm audit` | **0 vulnerabilities each** | The nested Vite lockfile received non-forced semver-compatible fixes; Expo SDK 57 stayed unchanged. |
| Project B default ACL catalog query, `--read-only` | **Found a security mismatch** | Global table, sequence, and function ACL defaults for `postgres` and `supabase_admin` grant anon/authenticated access. No `qralalay` schema-specific default rows exist. The foundation's schema-scoped revokes cannot cancel global grants. Full foundation equivalence is therefore not established. See the captured ACL rows and finding in `docs/migration/database-audit/12_default_privileges.csv` and `.txt`. |

Project B's CLI environment label is `production`. No hosted database writes, migration-history repair, secrets changes, or deployment occurred. The default-ACL mismatch blocks deployment preparation until a forward-fix strategy is reviewed. Supabase profile-photo storage, verified email changes for another invited user, and physical-device visual/accessibility checks remain pending.

## Photo continuation verification — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| Isolated Supabase clean replay | **Passed** | All ten active migrations applied to the disposable local stack. No hosted database was reset or modified. |
| `supabase test db` | **95/95 passed** | Security/catalog and transactional tests cover private photo bucket settings, protected path setters, resident and responder-photo authorization, previous RPC compatibility shapes, and existing incident workflows. |
| Local Storage HTTP integration | **9/9 passed** | Verified linked-resident photo upload/read/delete, case-scoped responder photo listing/signing, outsider denial, and authorized cleanup. Synthetic records, cases, users, and objects were removed. |
| `RESQR-Mobile: npm test` | **14/14 passed** | Existing data, role loading, session, notification and workflow regression suite. |
| Expo SDK 57 Android and web exports | **Passed** | Built with placeholder Supabase URL and publishable key. Android export is JavaScript bundle output, not a signed native build or device test. |
| `RESQR-Web: npm run build` | **Passed** | Vite production build with placeholder public Supabase configuration. |
| `RESQR2: npm test` | **38/38 passed** | Legacy Express regression suite remains green. |
| `RESQR2: npm run typecheck && npm run build` | **Passed** | Express backend remains available and default. |
| Local `public-qr-view` Edge Function smoke | **1/1 passed** | Missing-token request returned the expected HTTP 400 after the latest local database replay. Full Edge Function source was unchanged; previous 12 + 7 + 2 behavior checks remain the broader evidence. |
| `RESQR-Mobile/web: npm ci` | **0 vulnerabilities** | Installed the patched 146-package lockfile. |
| `RESQR-Mobile/web: npm run build` and `npm run lint` | **Passed** | Lint now targets the nested Vite app's `src/` so it does not lint the adjacent in-app `BystanderPublicWeb.js` file. |
| Fresh registry audits, all four packages | **0 vulnerabilities each** | Confirmed for `RESQR-Mobile`, `RESQR-Mobile/web`, `RESQR-Web`, and `RESQR2`. |
| Project B role capability query, `--read-only` | **Verified deployment constraint** | `postgres` is not superuser and is not a member of `supabase_admin`; `supabase_admin` can log in and is superuser. The available `postgres` connection cannot change `supabase_admin` default ACLs. No role or ACL write was attempted. |

This section supersedes the earlier pending-photo note above. The photo migration is prepared locally but not applied to Project B. Default-privilege equivalence remains the deployment blocker; the account email change flow for another user's sign-in address and physical-device visual/accessibility checks also remain open. Previously recorded Edge Function checks still cover 12 request/security checks, 7 public QR workflow cases, and 2 authenticated issuance/invitation happy paths; no Edge Function source changed during this continuation.

## Mobile and phone onboarding continuation — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **18/18 passed** | Covers full `legacyApi` method parity, email invitation, phone-only invitation, and phone claim before profile loading. |
| Isolated Supabase clean replay and `supabase test db` | **112/112 passed** | All eleven migrations applied. Security/catalog, phone function ACLs, phone verification/activation, and transactional workflow suites all passed with rollback-only fixtures. |
| Phone-only `invite-account` Edge Function integration | **Passed twice** | An authenticated local official created a phone-only guardian profile; retry returned the same profile despite Auth normalizing the phone. One Auth identity was created, remained unconfirmed, and the profile remained inactive/unlinked. Synthetic users and rows were removed. |
| Expo SDK 57 Android export | **Passed** | Supabase mode exported 1,647 modules using a placeholder URL and publishable key. The generated temporary bundle was removed. |
| Expo SDK 57 web export | **Passed** | Supabase mode exported 1,102 modules, including the lazy-loaded Supabase adapter chunk, using placeholder config. The generated temporary bundle was removed. |
| Whitespace check for new mobile adapter/test and SQL migration/test | **Passed** | Direct trailing-whitespace checks found none in the new files. |

Phone-only onboarding creates an unconfirmed Auth phone identity. The user must initiate and verify phone OTP, the database links only the verified identity, and an official must activate the still-inactive profile. Hosted deployment still requires a configured SMS provider. No hosted function or database was changed.

## QR revocation and integration continuation — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **19/19 passed** | Includes API adapter parity and a `revokeQr` contract test for card ID, reason, and missing-ID rejection. |
| `supabase test db --workdir /private/tmp/qralalay-supabase-isolated` | **116/116 pgTAP assertions passed** | Rollback-only local tests cover responder denial, official QR revocation, resulting `revoked` status, and exactly one audit record. No hosted database was used. |
| Expo SDK 57 Android export, Supabase mode | **Passed** | 1,647 modules; placeholder URL/publishable key only. Not a native signed build or physical device test. |
| Expo SDK 57 web export, Supabase mode | **Passed** | 1,102 modules; placeholder URL/publishable key only. |
| `RESQR-Web: npm run build` | **Passed** | Vite production bundle completed. |
| `supabase migration list --local` | **11/11 active migrations applied** | Local IDs match the prepared migration files; `README.md` is correctly ignored as a non-migration file. This is local state only. |
| `supabase db lint --local` | **Completed with 13 unused-variable warnings** | The linter exits successfully. Warnings are in existing functions whose `SELECT INTO` assignments may be used to set PL/pgSQL `FOUND`; they were left untouched pending code-level review. |
| Edge Functions | **12/12 request/security checks, 7/7 public workflow checks, 2/2 authenticated issue/invitation checks passed in the preceding continuation** | No Edge Function source changed during QR-revocation UI work. These checks remain local-only and do not establish hosted provider setup. |
| Dependency advisories | **0 vulnerabilities in all four package roots in the latest registry audit** | No dependency manifest or lockfile changed during this continuation. |

The resident profile exposes an official-confirmed QR revoke action through both the Supabase RPC adapter and the retained Express token endpoint. This result section is superseded for print/save by the following continuation. No Project B write/deployment, Project A change, migration-history repair, or Express retirement occurred. Project B's global default-ACL mismatch still blocks deployment; physical device/accessibility, SMS provider, verified hotline, and production website origin remain open.

## QR print/save continuation — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **20/20 passed** | Added a printable-card helper test checking QR embedding, invalid-image rejection, and omission of resident personal details. |
| Expo SDK 57 Android export | **Passed** | 1,654 modules with placeholder Supabase URL/key. |
| Expo SDK 57 web export | **Passed** | 1,109 modules with placeholder Supabase URL/key. |
| Mobile `npm audit` | **0 vulnerabilities** | Read-only audit after adding `expo-print@57.0.2` and `expo-sharing@57.0.27`. |
| Print implementation | **Bundled and unit-tested; physical print not verified** | Web opens the print dialog. Android/iOS generate a PDF and use the system share sheet for save/print. Output contains the QR image and QRAlalay instructions, not resident fields. |

The SDK-aware installer initially hit `ENOSPC`; six old temporary Expo exports in `/private/tmp` were removed, recovering space, and package installation then completed. No source files or Android SDK components were removed. Current free space is approximately 2.2 GiB, so storage is improved but still below the earlier 35 GiB report.

## Realtime client contract verification — 2026-11-25

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **21/21 passed** | Added coverage for the private profile-topic channel, `case_event` payload forwarding, and channel cleanup. |
| Current channel/policy source review | **Matched** | Client uses `qralalay:profile:<profile-id>` with `private: true`; the local migration authorizes only the caller's own matching profile topic, and case triggers send data-free invalidation payloads to selected recipients. |

Mobile refresh continues periodically and on foreground resume, so missed Realtime events are recovered by a later authorized API refresh. Live delivery/reconnect behavior still needs physical-device verification. Free space after removing generated exports is approximately 4.1 GiB.


## Current relocated workspace validation — 2026-11-26

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **21/21 passed** | Re-run from the current relocated repository. Includes adapter parity, QR print HTML privacy, QR revoke, and Realtime subscribe/cleanup contracts. |
| Expo SDK 57 Android export | **Passed** | 1,654 modules; placeholder Supabase URL and publishable key. Output was written to `/private/tmp` and removed. |
| Expo SDK 57 web export | **Passed** | 1,109 modules; placeholder Supabase URL and publishable key. Output was written to `/private/tmp` and removed. |
| `RESQR-Web: npm run build` | **Passed** | Vite production build with placeholder public Supabase configuration; output was written to `/private/tmp` and removed. |
| Local authenticated Supabase Realtime smoke | **1/1 passed** | A synthetic official subscribed to their private profile topic, received the data-free case invalidation, and all synthetic Auth/profile/barangay records were deleted. No hosted project was contacted. |
| Synthetic Auth cleanup verification | **Passed** | No `realtime-smoke-*` Auth users remained after the test. |

The source tree is currently at `Desktop/Desktop - Lyla’s MacBook Air/Project`, outside the configured writable workspace root `Desktop/Project`; the latter now contains a different project. Further source writes require workspace remapping or sandbox approval. Current actual free space was approximately 3.4 GiB, below the earlier 35 GiB report.


## Standalone QR website API contract tests — 2026-11-26

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Web: npm test` | **5/5 passed** | Mocked contract tests cover public QR lookup, idempotent request retry/capabilities, requester-owned cancellation cleanup, location start/update/stop/restart, and preserved Edge Function error status/code. No network requests were made. |

These tests validate the browser API layer's request/response contract. They do not replace physical browser/device interaction against a deployed HTTPS origin, which remains unverified.

## Verified barangay contact integration — 2026-11-26

| Command or check | Result | Notes |
|---|---|---|
| `RESQR-Mobile: npm test` | **23/23 passed** | Includes mobile API parity and RPC contract checks for listing, saving, and confirming contacts, plus an offline cache test that verifies only active confirmed number fields are stored. |
| `RESQR2: npm test` | **Incomplete** | 14 assertions passed; three test modules stalled while loading the moved source tree and were interrupted. No assertion failure was reported in completed tests. |
| `RESQR2: tsc --noEmit` | **Not completed** | No compiler output before interruption after prolonged source reads. |
| `RESQR-Web: npm test` | **5/5 passed** | Public QR request and capability lifecycle contracts. |
| Local Supabase migration and pgTAP | **135/135 passed** | New forward migration applied to the disposable local stack without reset. Four pgTAP files passed; no hosted project was linked. |
| `RESQR-Web: npm run build` | **Passed** | Vite production output written to `/private/tmp`; elevated access was needed for Vite's temporary cache under `node_modules`. |
| Changed JavaScript/JSX syntax | **13 files parsed** | Includes mobile navigation, contact screens/cache/adapters, and public website `ScanPage.jsx`. |
| Changed Express TypeScript syntax | **4 files transpiled** | Service, schema, controller, and routes transpiled with TypeScript diagnostics enabled. Full project typecheck remains incomplete. |
| Contact request schema | **Passed** | A valid hotline parsed; `+911` was rejected. |
| Expo SDK 57 Android export | **Stalled; stopped** | Ran over 19 minutes with no output files and did not respond to normal termination; stopped the specific build process. Copying source to `/private/tmp` also stalled on the moved Desktop file provider. |
| `supabase db lint --local` | **Passed with 13 existing warnings** | Zero exit status; warnings are in other workflow functions, and none named the new contact RPCs. |

The new contact migration exposes scoped RPCs; official writes are audited, new/changed numbers stay inactive until an official confirms them, and only active confirmed contacts are returned to guardians and public QR pages. The Express path, mobile official settings, offline display, and public website links are wired. No real number was entered or marked verified.

## Contact migration and current integration rerun — 2026-11-26

| Command or check | Result | Notes |
|---|---|---|
| Isolated `supabase migration up` | **Passed** | Applied only `20261125138000_barangay_contacts.sql` to `/private/tmp/qralalay-supabase-isolated`; did not reset the local database. No hosted project was linked. |
| Isolated `supabase test db` | **135/135 passed** | All four pgTAP files passed, including 19 contact security/workflow assertions for cross-barangay access and immediate public-projection invalidation. Synthetic fixtures roll back. |
| `RESQR-Web: npm test` | **5/5 passed** | Public QR API contracts and capability lifecycle. |
| `RESQR-Web: npm run build` | **Passed** | Vite production build to `/private/tmp/qralalay-resqr-web-build`; 23 modules transformed. |
| `RESQR2: npm test` | **Incomplete** | 14 assertions passed; three test modules stalled while loading the moved source tree and were interrupted. No assertion failure was reported in the completed tests. |
| `RESQR2: tsc --noEmit` | **Not completed** | No compiler output before the command was interrupted after a prolonged read. |
| Expo SDK 57 Android export | **Stalled; stopped** | The export ran for over 19 minutes without producing output files and did not respond to normal termination; the specific process was stopped. Copying the source to `/private/tmp` also stalled while reading the moved Desktop file provider. |
