# Implementation progress

Updated: 2026-11-25 (Asia/Manila).

## Phase 0 — Workspace protection and audit

- [x] Inspected workspace directories, nested repository boundaries and Git state.
- [x] Read the two supplied reports and current project documentation/source manifests.
- [x] Read the exact Expo SDK 57 versioned documentation before source changes.
- [x] Created a recovery snapshot at `/private/tmp/qralalay-mobile-pre-migration.tar.gz`, excluding local secrets, dependencies, device metadata and Git internals.
- [x] Recorded design-token baseline from `RESQR-Mobile/theme.js`.
- [x] Ran baseline mobile/API/web checks and recorded failures without suppressing them.
- [x] Initialized an isolated local Supabase project using the native runtime; no hosted project was linked.
- [x] Replayed all 16 legacy migrations into a fresh local database and captured a schema-only baseline with verified migration checksums.
- [x] Added and applied the first forward target-schema migration locally.
- [x] Ran the migration runner against the local database and confirmed it skips all 16 already-recorded legacy migrations.
- [x] Exported Android and web JavaScript bundles to temporary directories; the restructured mobile imports resolve.
- [ ] Capture emulator screenshots; no GUI/device session was available.
- [x] Inspected the schema, grants, and policies in the isolated local database. No production database was accessed.
- [x] Applied the updated clean-database direction: no fictional legacy rows will be imported; old backend remains a reference.
- [x] Moved the earlier legacy-derived Supabase migration files and pgTAP tests out of active migration/test folders while preserving them under `RESQR2/supabase/legacy_reference/`.
- [x] Located candidate `RESQR2/supabase/migrations/20261124171158_qralalay_foundation.sql`; its equivalence to the specified `001_qralalay_foundation.sql` remains unconfirmed.
- [x] Completed static local review: candidate defines 15 private-schema application tables and enables RLS, but includes no application policies/functions; local `get_my_profile()` and active Edge Function/database test implementations were not found.
- [ ] Compare the candidate against the intended live development schema; blocked because `.link.json` and backend `.env` point to different Supabase project references and the configured database host could not be resolved.

## Phase 1 — Requirements reconciliation and preparation

- [x] Initial gap analysis, feature parity, data mapping, rollback plan, access matrix, threat model, traceability and open-decision list created under `docs/`.
- [x] Recorded current-vs-target architecture and staged navigation decision.
- [ ] Refine route/service inventory against every source function and acceptance criterion.
- [x] Set up isolated Supabase local project and documented safe boundaries.
- [ ] Complete the eight project-document groups and obtain stakeholder decisions where required.

## Phase 2 — Clean Supabase backend foundation (blocked on target-project confirmation)

- [x] Recorded that the new target starts from clean schema with no legacy/fictitious row imports.
- [x] Preserved the previous local-only migration work under `supabase/legacy_reference/`; it is no longer in the active migration chain.
- [ ] Confirm the candidate foundation migration is the approved `001_qralalay_foundation.sql`, then compare its resulting schema with the intended live development project before assessing migration history.
- [ ] Apply the foundation to a clean local database and verify no legacy records are present.
- [ ] Generate new local synthetic Auth users and records from the approved schema.
- [ ] Add/verify RLS policies, explicit grants, secure database functions, Edge Functions, Storage policies, and direct access tests against the new schema.
- [ ] Implement notification processing and Realtime against the approved schema.

## Phase 3 — Authentication migration (limited prerequisite only)

- [x] Added a native Supabase session adapter that stores sessions through Expo SecureStore and a web-specific AsyncStorage adapter.
- [x] Added a unit test for session storage read/write/delete mapping and error propagation; Android and web exports resolve their platform-specific modules.
- [ ] Connect sign-in, account provisioning, role profile synchronization, recovery, and deactivation to Supabase Auth.
- [ ] Verify session restore, token refresh, logout, and account revocation on a physical Android device.
- [ ] Confirm the local public Supabase key is publishable/anon; `.env` values were not inspected.

## Phase 5 — Existing public QR privacy correction (partial; legacy path)

- [x] Removed resident name and medical-note fields from the public lookup SQL projection and response object.
- [x] Reject inactive residents in the public QR lookup.
- [x] Removed name and health information from the mobile and React public QR screens; 911 remains directly available without submitting an assistance request.
- [x] Removed internal incident IDs and the unused 911 dial-number field from the public scan result; request-specific cancellation/location credentials remain for current public workflow behavior.
- [x] Added backend tests asserting the public lookup allowlist, inactive-resident denial, and scan-result allowlist.
- [ ] Migrate public QR lookup and submission to Supabase with request-owned cancellation/status credentials and idempotency.
- [ ] Add a verified, approved barangay hotline for the public flow; no number was invented.

## Continuation status — 2026-11-25

- [x] Replayed the nine active target migrations in an isolated Docker Supabase copy; no hosted database was used.
- [x] Added private resident birth-date and account position/contact-address fields through forward migrations; updated protected list/write RPCs and mobile mappings. Public QR projection remains free of birth date.
- [x] Fixed mobile adapter methods that were overridden by duplicate placeholders, wired new guardian invitations, corrected the issued QR URL property, and routed web storage through the platform-specific session store.
- [x] Passed both target pgTAP files: 73/73 assertions, including transactional resident/account field writes and 49 security assertions.
- [x] Passed 12 local Edge Function request/auth/origin checks, 7/7 public QR happy-path checks, and 2/2 authenticated QR-issue/invitation happy paths using cleaned-up synthetic local fixtures; backend 38/38, mobile 14/14, Android and Expo web exports, and the separate Vite website build also passed.
- [x] Resolved reported dependency advisories for backend, mobile, and website: each `npm audit` reports zero vulnerabilities. Expo SDK 57 remains unchanged.
- [x] Completed the Project B default-privilege catalog query in read-only mode and saved the returned ACL rows under `docs/migration/database-audit/`.
- [ ] Resolve the verified default-privilege blocker before deployment preparation can be considered ready. Project B grants anon/authenticated broad global table, sequence, and function defaults for `postgres` and `supabase_admin`; `qralalay` has no schema-specific ACL rows. The foundation's schema-scoped revokes do not remove global grants.
- [ ] Implement and test Supabase private photo storage, including authorized signed URL reads and change/delete operations.
- [ ] Complete verified email-change flow for existing invited users; account contact fields and new invitations are wired.
- [ ] Complete physical-device visual/accessibility verification.
- [ ] Project B remains untouched. The CLI identifies it as `production`; migration-history repair, hosted SQL, secrets, and deployment remain unperformed.

## Original phase snapshot (superseded by the continuation status above)

The mobile worktree remains uncommitted and preserved. There has been no resident data migration, hosted cutover, or deployment. Local Supabase database workflows and public QR Edge Functions are now implemented and tested as recorded above. The API and website retain their existing configuration, and Express remains the default backend. See `docs/testing/TEST_RESULTS.md` for current test results and remaining limitations.

## Latest continuation — 2026-11-25

- [x] Added `20261125136000_private_profile_photos.sql`: private 700 KiB JPEG/PNG/WebP storage, profile and resident photo paths, protected setters, one-hour signed reads, and case-scoped access to an assigned responder's photo.
- [x] Connected mobile profile, account, resident, and case-photo reads/writes to Supabase Storage and the protected RPCs. Photo replacement uploads the new object first, updates the path transactionally, then removes the prior object; failures clean up the new upload. Existing picker UI and image treatment remain unchanged.
- [x] Replayed all ten active migrations on the isolated local stack. Updated database tests pass **95/95**, including compatibility-wrapper tests; local Storage HTTP integration passes **9/9**, including case-scoped responder-photo listing/signing. Synthetic rows, cases, users, and objects were removed.
- [x] Mobile unit tests pass **14/14**. Expo SDK 57 Android and web exports pass with placeholder Supabase URL/key. The standalone QR website Vite build passes. Backend Express tests pass **38/38**, with typecheck and production build passing.
- [x] Previously completed local Edge Function checks remain 12/12 validation/security checks, 7/7 public QR workflow checks, and 2/2 authenticated QR issuance/invitation checks. Edge Function source was not changed in this continuation.
- [x] After the latest isolated database replay, the local `public-qr-view` Edge Function returned the expected HTTP 400 validation response for a missing token (1/1 smoke check).
- [x] No package manifests or lockfiles changed in this continuation; the previously recorded backend, mobile, and website audits reported zero vulnerabilities.
- [ ] Project B structural foundation comparison matches the captured 15 tables, 157 columns, 117 constraints, and 46 indexes, but full security equivalence is still blocked: global defaults grant client privileges for `postgres` and `supabase_admin`, with no `qralalay`-specific default ACL rows. Do not apply or repair migrations until a reviewed forward-fix strategy and explicit approval exist.
- [ ] Verified self-service email change is supported; an official changing another linked user's sign-in email remains unsupported because that would bypass Supabase's email verification flow.
- [ ] Physical Android visual/accessibility checks remain outstanding. Express stays the default and is not retired. Project B was not modified, and no migration, secret, or Edge Function was deployed.

## Default-privilege role-capability follow-up — 2026-11-25

- [x] Completed a read-only Project B role check: `postgres` can log in/create roles but is not superuser and is not a member of `supabase_admin`; `supabase_admin` can log in and is superuser.
- [x] Confirmed the available `postgres` connection cannot change the `supabase_admin` default ACLs. A Project B DBA/Supabase owner must provide and review an administrative path for that owner.
- [x] Updated the remediation and foundation-equivalence records; no hosted SQL, role change, migration repair, secret change, or deployment was performed.
- [ ] Reconcile the global defaults for both owners, rerun catalog and privilege checks, then seek explicit approval for any hosted migration-history repair or deployment action.

## Mobile Supabase adapter parity follow-up — 2026-11-25

- [x] Added the missing `registerGuardian` adapter method. It uses the existing authenticated `invite-account` Edge Function, scopes linked wards through the protected database RPC, and preserves the Express response field shape.
- [x] Added a contract test that confirms every `legacyApi` method has a Supabase adapter and covers email and phone guardian invitations. Mobile tests pass **18/18**.
- [x] Re-exported Expo SDK 57 Android and web bundles with placeholder Supabase configuration after the adapter change; both passed. Temporary bundles were removed.
- [x] Added `20261125137000_phone_profile_invitations.sql`: phone Auth users are linked only after verified OTP, guardian ward links remain pending, and account activation remains an official action.
- [x] Replayed all eleven migrations in the isolated local stack; pgTAP passes **112/112**, including phone function ACLs, normalized Auth phone matching, and the inactive-until-activation rule.
- [x] Exercised the local `invite-account` Edge Function twice with an authenticated synthetic official. Both requests returned the same pending profile; one unconfirmed phone Auth identity was created and all synthetic fixtures were removed.
- [x] Re-exported Expo SDK 57 Android and web after the completed phone onboarding changes; both pass with placeholder Supabase configuration. Temporary bundles were removed.
- [ ] Configure and verify a hosted SMS provider before deploying phone OTP onboarding. No Project B secrets or settings were changed.

## QR revocation and integration continuation — 2026-11-25

- [x] Added an official-confirmed QR revoke action to the existing resident QR screen. It invokes `revoke_qr_card` in Supabase or the existing token-based Express delete endpoint without changing the screen's branding/layout.
- [x] Added mobile adapter coverage for revocation request arguments and missing-card rejection; mobile tests pass **19/19**.
- [x] Extended the local workflow suite with role-denial, successful official revoke, revoked status, and audit-row checks. Isolated pgTAP now passes **116/116**.
- [x] Re-exported Expo SDK 57 Android (**1,647 modules**) and web (**1,102 modules**) with placeholder Supabase URL/key; standalone `RESQR-Web` Vite build also passes.
- [x] Reconciled stale migration/parity/gap/requirements documents with current evidence and recorded still-pending approval/hosting/device work.
- [x] QR file print/save has been implemented in a later continuation below; physical Android/TalkBack flow remains unverified.
- [ ] Project B global default ACL mismatch remains unresolved; foundation structural equivalence is not full security equivalence. Project B was not modified, migration history was not repaired, Project A was not changed, and Express remains the default.

## QR print/save continuation — 2026-11-25

- [x] Replaced the resident QR screen's placeholder action with SDK 57 `expo-print` and `expo-sharing`: web uses the print dialog; Android/iOS create a PDF and open the system share sheet.
- [x] Printable A5 output carries the QRAlalay brand and assistance instructions with the QR image. It deliberately omits resident name, address, guardian, and date-of-birth fields.
- [x] Added a pure QR card HTML helper and privacy/validation test. Mobile tests pass **20/20**; Expo Android (**1,654 modules**) and web (**1,109 modules**) exports pass.
- [x] The mobile dependency audit reports **0 vulnerabilities** after installing SDK 57 compatible `expo-print@57.0.2` and `expo-sharing@57.0.27`.
- [ ] Physical print/share behavior and visual accessibility still need device verification. Project B global ACLs remain the hosted deployment blocker; Project A is unchanged and Express remains the default.

## Realtime client contract verification — 2026-11-25

- [x] Verified the existing Supabase private profile-topic listener matches the database authorization wrapper and recipient-only, data-free case invalidation broadcast.
- [x] Added adapter tests for private topic options, payload forwarding, and channel cleanup. Mobile tests pass **21/21**.
- [ ] Device live-delivery/reconnect acceptance and scheduled worker operation remain unverified. Periodic refresh and foreground refresh continue as recovery paths.


## Relocated workspace validation — 2026-11-26

- [x] Revalidated the current QRAlalay source tree after it moved: mobile tests **21/21**, Expo SDK 57 Android/web exports (**1,654/1,109 modules**), standalone Vite build, and a live local authenticated Realtime broadcast all pass.
- [x] Confirmed the synthetic Realtime Auth user, profile and barangay were removed; no synthetic Auth fixture remains.
- [ ] The configured workspace root now points to a different project. QRAlalay is under `Desktop/Desktop - Lyla’s MacBook Air/Project`; further edits require a writable-root update or sandbox approval.
- [ ] Project B default global ACL mismatch remains the hosted deployment blocker; do not deploy or repair migration history without approval.


## Standalone website API verification — 2026-11-26

- [x] Added `RESQR-Web` Node tests for public QR lookup, idempotent submission capabilities, requester cancellation, temporary location lifecycle, and backend error propagation. Website tests pass **5/5** with mocked fetch; no live/hosted service was called.
- [ ] Browser/device end-to-end against the isolated Edge Function runtime and approved production HTTPS origin remains outstanding.


## Barangay emergency contacts — 2026-11-26

- [x] Added forward-only contact-management RPCs on the existing `qralalay.barangay_contacts` foundation table. Officials can add/edit, explicitly confirm, or deactivate their barangay contacts; all writes are audited. Changing a phone number clears its verified/active state.
- [x] Added the matching Express migration and authenticated, barangay-scoped routes while Express remains the default backend.
- [x] Added official contact management in mobile Settings, verified contact calling in the guardian emergency screen, a guest emergency page linked from Start, and confirmed-contact links in the public QR website. Mobile caches only the public confirmed fields, labels the offline value with its last sync date and barangay, and offers 911 without a login.
- [x] Added rollback-only pgTAP security/workflow coverage and mobile adapter/cache contract tests.
- [x] Mobile suite passes **23/23**.
- [x] Applied the new forward migration to the disposable local Supabase stack and ran all pgTAP suites: **135/135 passed** without resetting the local database, including cross-barangay denial and immediate public projection invalidation.
- [x] Public website API tests pass **5/5** and the production Vite build succeeds.
- [x] Parsed the changed JavaScript/JSX files (13 files), transpiled the four changed Express TypeScript files for syntax, and executed the contact request-schema check: valid contact accepted, `+911` rejected.
- [ ] Express regression/typecheck and updated Expo SDK 57 Android/Web exports remain unverified. The Express suite completed 14 assertions before three test modules stalled on source reads; `tsc --noEmit` returned no output. The Android Expo export made no progress for over 19 minutes and was stopped; staging the project to `/private/tmp` also stalled on the moved Desktop file provider. No Express assertion failure was reported.
- [ ] No contact number is seeded. A barangay official must enter and personally confirm the actual number before any caller sees it.


## Folder rename and mobile/website organization — 2026-11-26

- [x] Renamed `Project` → `QRAlalay`, `RESQR-Mobile` → `QRAlalay-Mobile`, `RESQR-Web` → `QRAlalay-Web`, `RESQR2` → `QRAlalay-Backend`. Git repositories, remotes, history, `.env` files and recovery branches moved unchanged. Earlier entries in this log keep the old names.
- [x] Mobile reorganized into `components/`, `constants/`, `contexts/`, `hooks/`, `navigation/`, `screens/{auth,official,guardian,responder,shared}`, `services/`, `utils/`, `tests/`; website into `src/{components,pages,services}` and `tests/`.
- [x] Removed the nested mobile Vite starter, duplicate scanner screens, unused components/assets, and the root Kotlin starter (archived in `_recovery/`).
- [x] Centralized the approved palette in `QRAlalay-Mobile/constants/theme.js`.
- [x] Mobile tests 23/23, website tests 5/5 and build, Android bundle (1,818 modules) pass from the new paths. Supabase `project_id`, migrations, Edge Function names, Project B ref and production URLs are unchanged.
