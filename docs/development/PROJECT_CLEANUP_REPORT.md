# QRAlalay Project Cleanup and Redundancy Audit

**Audit date:** 2026-11-26  
**Workspace:** `/Users/lylajanevillanueva/Desktop/Desktop - Lyla’s MacBook Air/Project` (relocated QRAlalay tree)  
**Status:** Workspace inventory and safe metadata cleanup are complete. Source-level removal candidates remain approval-gated. Backend, dependency, and verification findings are refreshed through 2026-11-26.

## Scope and method

Reviewed the workspace inventory, package manifests and lockfiles, app/build configuration, navigation registry, static import/require references, asset references, common documentation links, ignore rules, Supabase migrations/functions/tests, local Supabase project-link metadata, and the separate Android app entry point. The workspace contains nested Git repositories for `RESQR-Mobile` and `RESQR-Web`; `RESQR2` and the top-level Android app do not have a Git boundary inside this workspace. The parent Git lookup resolves outside this workspace, so it must not be used for project cleanup or commits.

The path-level inventory is `PROJECT_FILE_INVENTORY.csv` with 350 non-generated file rows, each assigned a class, purpose, and runtime/build role. The earlier mobile folder reorganization's 73 old-to-current file paths are listed in `PROJECT_FILE_MOVES.csv`; all 73 destinations exist. Installed dependencies, generated build outputs, and caches are summarized separately because their thousands of files are reproducible. Actual `.env` contents and database backup contents were not read.

The audit did not print or inspect the contents of actual `.env` files. The follow-up backend work used only the disposable local Supabase stack; Project A and hosted Project B were not modified, reset, repaired, or deployed. Expo SDK 57 versioned documentation was read as required by the workspace instructions. Historical filesystem checks disagreed with the user's report of 35 GiB free; the user has since confirmed the storage issue is resolved. Old temporary Expo exports were removed to recover space; source and Android SDK components were preserved.

## Current workspace map

```text
Project/
├── .gitignore, .idea/                 Android Studio workspace settings
├── APP_FLOW_AUDIT.md                  application workflow audit
├── RESQR-Mobile/                      Expo 57 mobile app
│   ├── App.js, index.js, app.json     app entry and Expo configuration
│   ├── assets/                        branding and app icons
│   ├── component/                     shared UI and navigation components
│   ├── lib/                           app state, API, session, models, utilities
│   ├── screens/{admin,guardian,responder}/ role-specific screens
│   ├── web/BystanderPublicWeb.js      referenced in-app public scan flow
│   ├── web/src/                       separate stock Vite starter application
│   └── *.test.cjs                     mobile regression tests
├── RESQR-Web/                         intended standalone public QR website
│   ├── src/                           React scan flow, API, location, styling
│   └── Vercel/Vite configuration
├── RESQR2/                            legacy Express API and active Supabase work
│   ├── src/                            Express API, services, migrations, tests
│   ├── scripts/, db-backups/, docs/    legacy operations and reference material
│   └── supabase/                       Project B config, eleven migrations, functions, tests
├── app/                                separate Kotlin/Compose starter app
└── docs/                               project, design, security, migration, test docs
```

The safe cleanup removed empty directories `RESQR-Mobile/components/`, `hooks/`, and `navigation/` (the current code uses `component/` and `lib/`); empty `RESQR-Web/QRAlalay_Website/`; and the now-empty generated `RESQR2/supabase/.temp/`. No non-empty application directory was moved or merged.

### Before and after

The safe cleanup removed only metadata and empty directories. The mobile source layout had separately been reorganized before this report: 73 files moved from `src/` and `tests/` into `component/`, `lib/`, `screens/`, `web/`, and root test files, with 205 relative references updated. The current mobile README and `PROJECT_FILE_MOVES.csv` record the old-to-current mapping. No files were merged. One separate source deletion, `RESQR-Mobile/lib/testData.js`, is present in the current worktree; it contains mock demo accounts and records, has no current imports, and the current README says the app has no built-in demo accounts. It is listed below for review; it was not deleted by the safe-metadata cleanup in this audit. `RESQR-Mobile/screens/guardian/temp` was restored and remains present.

### Directory-wide classifications

| File set | Classification | Purpose and evidence |
|---|---|---|
| `RESQR-Mobile/App.js`, `index.js`, `app.json`, `package.json`, `package-lock.json` | KEEP | Expo entry, app configuration, and reproducible dependency/runtime setup. Expo SDK 57 documentation was consulted. |
| `RESQR-Mobile/assets/*` | KEEP | Branding and icon files are referenced by Expo config, `StartScreen.js`, `Avatar.js`, and alert screens. |
| `RESQR-Mobile/component/*`, `lib/*`, `screens/*`, `theme.js` | KEEP | Shared app UI, navigation, data/session/API logic, and role-specific screens. Navigation registrations and imports were reviewed; screen similarities do not establish redundancy. |
| `RESQR-Mobile/lib/testData.js` (deleted in current worktree) | REVIEW | Old frontend demo-account data. Current reference scan found no imports; app README states no built-in demo accounts. Recoverable from Git history if those demo records are still required. |
| `RESQR-Mobile/*.test.cjs` | KEEP | Current regression tests run by the mobile package's `test` script. |
| `RESQR-Web/package.json`, `package-lock.json`, `vite.config.js`, `vercel.json`, `index.html`, `.env.example`, `src/*`, `public/*` | KEEP | Standalone site build, security checks, routes, QR flow, API/location code, and deploy configuration. |
| `RESQR2/package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`, `src/*`, `scripts/*`, `tests/*` | KEEP / legacy-preserve | Express implementation, its migration/test/build commands, and recovery/reference workflows. Keep until approved Supabase retirement criteria pass. |
| `RESQR2/supabase/config.toml`, `supabase.lock`, migrations, functions, shared code, database tests | KEEP | Active Project B Supabase workspace; migration names and contents remain unchanged. |
| `docs/*`, `APP_FLOW_AUDIT.md`, `RESQR2/docs/*`, database audit exports and backups | KEEP / REVIEW for organization | Thesis and migration evidence. Backend-specific docs remain separate until a link-safe documentation move is approved. |
| root `.gitignore`, `.idea/*`, project `.gitignore` files | KEEP / GENERATED exclusions | Workspace/editor settings and existing ignore patterns. No ignore-file edit was necessary. |
| actual `.env` files and `.env.example` files | KEEP / confidential vs template | Actual local configuration is protected and not reported; examples are placeholders for setup. |
| `app/*` | REVIEW | Independent Kotlin/Compose starter, separate from Expo and not referenced by its native module configuration. Retain pending ownership/approval decision. |

## Classification and actions

| File or directory | Current purpose | Classification | Proposed/current action | Reason | Risk | Dependencies |
|---|---|---|---|---|---|---|
| `.DS_Store` | macOS folder metadata | DELETE | Removed | Disposable OS metadata; root ignore rule already exists | None | None |
| `.idea/caches/deviceStreaming.xml` | Android Studio device-streaming cache | GENERATED | Removed | Re-creatable cache, already covered by `.idea/caches` ignore | None | Android Studio may recreate it |
| `RESQR2/supabase/.temp/cli-latest` | Supabase CLI temporary version marker | GENERATED | Removed | Under ignored `.temp/`; no source/config dependency | None; CLI can recreate | Supabase CLI |
| `RESQR2/supabase/.supabase.lock.lease` | Supabase CLI lease/coordination file | KEEP / GENERATED | Preserved | May be owned by an active CLI process; no safe ownership check was available | Deleting while held could disrupt tooling | Supabase CLI |
| `RESQR-Mobile/screens/guardian/temp` | Tracked UI fragment/draft | REVIEW | Restored from current mobile `HEAD`; no deletion remains | Filename and lack of imports were insufficient grounds to delete; source deletion requires approval | Low runtime impact, but it is tracked work | Mobile Git history; not registered by navigation |
| `RESQR-Mobile/lib/testData.js` | mock demo residents, incidents, and account personas | REVIEW | Existing worktree deletion; record as a source deletion requiring owner confirmation | No current import/reference; app README says there are no built-in demo accounts. Recoverable from Git history | Reintroducing it could restore fictitious resident data; keeping it deleted removes demo fixtures | Previously imported by `AppDataContext`; current loader uses API clients |
| `RESQR-Mobile/component/` and role screen directories | Shared and role-specific mobile UI | KEEP | No move | Navigator and `lib/screenRegistry.js` import these files; scanner wrapper screens are used | High if removed or moved incorrectly | Expo app navigation |
| `RESQR-Mobile/web/BystanderPublicWeb.js` | Public QR scan flow embedded in Expo navigation | KEEP | Preserve | `component/AppNavigator.js` imports and registers it; it calls the mobile API client | High if removed | Mobile navigation, API, Expo Location |
| `RESQR-Mobile/web/src/` and its Vite package/config/assets | Stock React/Vite counter starter; not the integrated public scan component | REVIEW | Propose archive or removal only after owner approval | README and `App.jsx` identify it as the default Vite starter; it has a separate package and is not used by Expo navigation. No unique QR workflow was found there | Low for the product if truly abandoned; moderate for local demonstrations | Its own `package.json`, lockfile, Vite config, `src/`, public icons |
| `RESQR-Web/` | Intended standalone public QR website | KEEP | Preserve as primary website | README, Vercel config, scan route, Supabase/legacy API client, cancellation and live-location flow show it is the production-oriented website | High if removed | Vite build, `src/`, `.env.example`, Vercel config |
| `RESQR-Mobile/web/BystanderPublicWeb.js` vs `RESQR-Web/src/ScanPage.jsx` | Related public scan experiences | REVIEW | Do not merge during cleanup | Both implement QR alert flows; standalone website has live-location-sharing behavior not present in the in-app component. Consolidation could change behavior/UI | Moderate to high | Separate runtime targets, API adapters, navigation/deployment |
| `RESQR2/src/` and `src/db/migrations/` | Legacy Express API and original SQL migration history | KEEP / ARCHIVE candidate | Preserve until Supabase replacement is deployed and parity is verified | Mobile `.env.example` defaults to legacy mode when backend mode is unset; legacy services and business rules are still present | High | Mobile app, API consumers, legacy database and recovery procedures |
| `RESQR2/supabase/migrations/` | Active Project B migration chain | KEEP | Preserve names and contents | The migrations are active deployment history; instructions prohibit renaming or rewriting applied versions | Critical | Project B database and migration ledger |
| `RESQR2/supabase/functions/`, `_shared/`, tests and config | Active Supabase functions, common HTTP utilities, local config, security/workflow tests | KEEP | Preserve | These implement the target architecture and are not yet fully deployed/verified | Critical | Project B, Supabase CLI, secrets, database schema |
| `RESQR2/supabase/supabase.lock`, `.link.json`, `.supabase.lock.lease` | Supabase CLI project/service lock, local link metadata, and lease state | KEEP / GENERATED(local) | Preserve all | The lock and ignored link metadata identify Project B. The lease may be active. CLI package is pinned in `RESQR2/package-lock.json` as 3.4.0; no removal attempted | High if project link or lock data is lost; lease deletion can disrupt CLI | Supabase CLI 3.4.0 in lockfile, Project B ref `jmzpqfgbjigbxkuofaae` |
| `RESQR-Mobile/.expo/dev/logs/export.log` and Expo favicon cache | Generated export log and transformed asset cache | GENERATED | Removed after Expo exports completed | Re-creatable and no live Metro/Expo process depended on these outputs | None; Expo regenerates as needed | Expo SDK 57 |
| `node_modules/` in the four package roots | Installed JS dependencies | GENERATED / KEEP | Preserve | Current test/build/audit workflows use these installs; user explicitly requested retaining required development dependencies | Reinstall is reproducible but costs time/bandwidth | Each package's lockfile |
| `RESQR-Web/dist/`, `RESQR-Mobile/web/dist/`, `RESQR2/dist/` | Generated website bundles and Express build | GENERATED / KEEP | Preserve current outputs | Vite preview/deployment can use website output; Express `npm start` runs `dist/server.js` | Removing Express output would break current start until rebuild; web output is useful for preview | Corresponding build scripts |
| `RESQR2/npm-audit-report.json` | Saved older npm audit result | ARCHIVE / KEEP | Preserve and label as historical | It records a previous vulnerable tree; current registry audits report zero advisories | Could mislead if treated as current | Historical package-lock state |
| `RESQR2/supabase/snippets/001_qralalay_foundation.sql` and active foundation migration | Identical SQL content (matching SHA-256) | REVIEW | Preserve both until migration workflow owner confirms snippet is disposable | Exact duplicate confirmed, but user explicitly requires preservation of original foundation SQL; snippet may be an intentional recovery artifact | Moderate if deleted before confirming provenance/use | Active migration and manual SQL workflows |
| `RESQR2/supabase/legacy_reference/` | Historical schema attempt and tests, explicitly excluded from active migration paths | ARCHIVE | Keep archived | README says these files are not for the clean target project but preserve earlier business-rule/recovery context | High if accidentally applied; preserve for historical context | Documentation only; not in active Supabase migration/test folders |
| `RESQR2/db-backups/`, audit exports in `docs/migration/database-audit/` | Recovery and schema audit evidence | KEEP / REVIEW | Preserve and control access | Required thesis/migration evidence; may include sensitive fictional test data | Moderate confidentiality risk | Migration review and recovery |
| Root `app/` | Kotlin/Compose “Hello Android” starter, package `com.example.myapplication` | REVIEW | Require approval before archiving/removal | Separate from Expo; no Expo module references, no QRAlalay implementation, no in-workspace Gradle settings/wrapper/build scripts found; app is untracked in the external parent Git context | Low runtime impact; provenance/history cannot be established safely | Android Studio/Gradle setup may exist outside this directory |
| `docs/` and `RESQR2/docs/` | Project-level and backend-specific architecture/migration evidence | KEEP / MOVE proposal | Do not move yet | Root docs cover thesis/project scope; `RESQR2/docs/ERD.md` and `SQL_CONFORMANCE.md` are backend-specific. A move needs relative-link updates and a safe Git boundary | Moderate broken-link risk | Markdown references and future Git layout |
| `RESQR-Mobile/README.md` | Setup and architecture documentation | REVIEW | Update stale historical path examples in a separate approved docs pass | It labels a prior `src/` layout, then documents the restored root layout later; the explanation is useful but confusing | Low runtime impact; onboarding confusion | Mobile source paths and project docs |
| `.env` files | Local environment configuration | KEEP / CONFIDENTIAL | Preserve; contents not reported | Needed for local connection/recovery; `.gitignore` rules protect actual env files | High if exposed or committed | Mobile, website, legacy backend |
| `.env.example` files | Placeholder configuration templates | KEEP | Preserve | Required onboarding; reviewed templates use placeholder values and distinguish public client keys from server-only secrets | Low when placeholders stay placeholders | Local setup |

## Confirmed safe cleanup and storage

Removed files:

- `.DS_Store` (6,148 bytes)
- `.idea/caches/deviceStreaming.xml` (cache; size was not recorded before deletion)
- `RESQR2/supabase/.temp/cli-latest` (6 bytes)
- `RESQR-Mobile/.expo/dev/logs/export.log` (14,023 bytes) and the remaining generated favicon cache file (size not recorded), after Expo export processes had finished.

Removed empty directories:

- `RESQR-Mobile/components/`, `RESQR-Mobile/hooks/`, `RESQR-Mobile/navigation/`
- `RESQR-Web/QRAlalay_Website/`
- `RESQR2/supabase/.temp/`

The tracked `RESQR-Mobile/screens/guardian/temp` file was restored. The only source deletion surfaced in the current mobile worktree is `lib/testData.js`, documented above; this audit did not delete or restore it. Safe cleanup recovered at least **20,177 bytes plus the IDE cache** (6,154 bytes of OS/temp metadata and 14,023 bytes of Expo log; the favicon cache size was not captured). The user later reported 35 GiB free after removing unused emulator components. No Git-ignore changes were needed: existing rules cover `.DS_Store`, Android Studio caches, Expo output, Vite output/logs, Supabase `.temp/`, and the lease file. The nested mobile/web lockfile was updated later for compatible security fixes; other lockfiles remain intact.

## Duplicate and organization findings

- `RESQR-Mobile/component/` is the active shared UI folder. The old `components/`, `hooks/`, and `navigation/` directories were empty; their code has current locations in `component/` and `lib/` and is reflected in the mobile README's restored-layout table.
- `RESQR-Mobile/web/BystanderPublicWeb.js` is not the nested Vite site. It is imported from the Expo navigator and must remain unless replaced deliberately.
- `RESQR-Mobile/web/src/` is a stock Vite starter. It is distinct from both the in-app scan component and the intended `RESQR-Web/` deployment. Archive/removal is a candidate requiring approval.
- `RESQR-Web/` implements the standalone scan site, including optional location, alert cancellation, and live-location sharing. Keep it as the intended website.
- The foundation SQL snippet and active migration are byte-identical. Both are preserved pending confirmation of the snippet's role.
- The active migration chain contains ten files: foundation (`20261124171158`), profile lookup (`20261125120000`), authorization (`20261125121000`), public QR gateway (`20261125130000`), case management (`20261125131000`), notification worker (`20261125132000`), Auth invitations (`20261125133000`), resident birth date (`20261125134000`), account contact fields (`20261125135000`), and private photos (`20261125136000`). Preserve exact filenames and applied migration history.

## Dependency audit

All four package manifests have corresponding lockfiles. The nested `RESQR-Mobile/web/package-lock.json` was refreshed with non-forced semver-compatible updates after a current registry audit found advisories; no dependency was removed and no major-version force update was used. Source import/reference scanning found these review candidates, not authorized removals:

| Package | Finding | Classification | Next step / risk |
|---|---|---|---|
| `RESQR-Mobile`: `expo-status-bar` | No direct source import/reference found | REVIEW | Confirm Expo/plugin/runtime expectations before removal; low apparent app risk |
| `RESQR-Mobile`: `react-native-url-polyfill` | No direct source import/reference found | REVIEW | Confirm React Native/Supabase URL support and SDK 57 compatibility before removal; moderate compatibility risk |
| `RESQR-Mobile/web`: `@types/react`, `@types/react-dom` | No TS/TSX source and no direct use found in the Vite JavaScript starter | REVIEW | Likely unnecessary development dependencies; remove only after confirming expected type-check tooling |
| `RESQR2`: `@supabase/server` | No direct source import/reference found; the code imports `@supabase/supabase-js` | REVIEW | Check whether it is intentionally retained for a planned server integration before removal |

Other apparent no-import entries (`expo-font`, `react-native-screens`, `react-native-svg`, `react-native-web`, `@expo/metro-runtime`) support font loading, React Navigation, QR rendering, or Expo web runtime and are not treated as unused. Website `@fontsource/poppins` is consumed through CSS-style font imports. `supabase`, `tsx`, `tsc-alias`, `typescript`, and `pino-pretty` support CLI, test/build scripts, or logger configuration. The refreshed registry audits report **0 vulnerabilities** in `RESQR-Mobile`, `RESQR-Mobile/web`, `RESQR-Web`, and `RESQR2`. In the nested Vite package, compatible lockfile updates resolved advisories in `vite`, `brace-expansion`, `minimatch`, `source-map-js`, and `zod`; the manifest ranges still cover the resolved versions. `RESQR2/npm-audit-report.json` is retained as historical evidence of an older vulnerable tree and must not be read as current status.

## Files and changes requiring explicit approval

| File or directory | Current purpose | Classification | Proposed action | Reason | Risk | Dependencies |
|---|---|---|---|---|---|---|
| `app/` | Separate Kotlin Android starter | REVIEW | Archive outside the active workspace or remove only after approval | Appears unrelated to QRAlalay/Expo and lacks local build scaffolding, but history/provenance is not established | Low product risk; possible thesis/Android Studio work loss | Standalone Kotlin/Compose project |
| `RESQR-Mobile/web/src/`, nested `package*.json`, Vite files and starter assets | Stock Vite demo | REVIEW | Archive or remove after approval | Clearly boilerplate, no public QR logic found; still a separate project with its own scripts | Could remove a local teaching/demo target | Nested Vite package |
| Candidate dependencies listed above | Possible unused packages | REVIEW | Remove only after compatibility/build verification and approval | No source imports found for those candidates | Build/runtime compatibility risk | Package manifests and lockfiles |
| `RESQR-Mobile/README.md` and overlapping setup/deployment docs | Onboarding and architecture notes | REVIEW | Edit/relocate only in an approved documentation pass | Some path examples describe the earlier layout; root docs and backend docs have distinct purposes | Broken links or loss of historical context | Relative Markdown links |
| `RESQR-Mobile/lib/testData.js` | Old mock personas, residents and incidents; currently deleted in the worktree | REVIEW | Keep the current deletion only after owner approval, otherwise restore from Git | No current import/reference; current app docs state there are no built-in demo accounts | Low runtime risk; could lose locally useful mock data | Historical `AppDataContext` import and mobile Git history |
| foundation SQL snippet duplicate | Duplicate SQL artifact | REVIEW | Keep until owner confirms whether it is a scratch/reference artifact | Original foundation SQL must be preserved | Migration/recovery confusion | Active foundation migration |

## Legacy files to preserve temporarily

Do not retire the following until the conditions below are met:

- `RESQR2/src/` Express controllers, routes, middleware, services, sockets, timeout job, environment config, and utility modules.
- `RESQR2/src/db/migrations/001_init.sql` through `016_profile_photos.sql`, `scripts/run-migrations.js`, `scripts/backfill-addresses.ts`, and `tests/`.
- `RESQR2/db-backups/`, `RESQR2/docs/`, `requests.http`, and root migration/audit documentation.
- Mobile legacy API/session mode and website legacy API fallback while either client can still select or default to it.
- `RESQR2/supabase/legacy_reference/` as archived historical evidence; never restore its contents into active migration/test directories without explicit migration review.

### Legacy retirement checklist

1. Verify and deploy the complete Supabase migration chain to Project B; confirm migration ledger and schema without repairing history as part of cleanup.
2. Deploy each Edge Function and validate its configured secrets, public origins, and authenticated/internal access.
3. Pass database security and workflow tests against the intended target.
4. Verify Android mobile Supabase mode for sign-in/session restore, official/guardian/responder flows, QR scanning, alerts, location, notifications, and recovery.
5. Verify the `RESQR-Web` public QR flow, cancellation, location behavior, and deployment configuration.
6. Confirm feature parity and document rollback/recovery steps.
7. Obtain explicit approval before removing Express code, SQL history, scripts, tests, backups, or legacy client modes.

## Files that must remain during migration

- Active Supabase `config.toml`, `supabase.lock`, `.link.json`, and any active `.supabase.lock.lease`.
- Active Supabase migrations, Edge Functions, `_shared/` utilities, and database security/workflow tests.
- `RESQR2/supabase/legacy_reference/`, original Express migrations/source/tests, database backups, audit exports, and rollback documentation.
- All four package lockfiles and environment example files.
- Actual local `.env` files and credentials in their protected local state; never print or commit them.
- Mobile assets referenced by `app.json`, `Avatar.js`, `StartScreen.js`, and alert screens; role-specific screen files registered in `lib/screenRegistry.js`.
- `RESQR-Web/` production-oriented public site and the in-app `BystanderPublicWeb.js` component.

## Verification results and limits — 2026-11-25 checkpoint

The checkpoint below is historical; the continuation section after these recommendations records newer results and supersedes counts where stated.

- `RESQR-Mobile`: `npm test` passed, **18/18** after adding API parity, email and phone invitation, and verified-phone linking coverage; Expo SDK 57 Android and web exports passed using placeholder Supabase URL/key.
- `RESQR-Mobile/web`: after the compatible lockfile fix, `npm ci` audited 146 packages with **0 vulnerabilities**; `npm run build` and `npm run lint` passed. The lint script now targets this Vite app's `src/`, not the sibling in-app `BystanderPublicWeb.js`.
- `RESQR-Web`: production Vite build passed using placeholder public Supabase configuration.
- `RESQR2`: Express tests passed **38/38**; typecheck and build passed. The latest four package registry audits report **0 vulnerabilities**.
- Supabase: all eleven active migrations replayed in the isolated local stack; pgTAP passed **112/112** security and workflow assertions. The latest phone-only `invite-account` Edge Function integration passed twice, including an idempotent retry against Auth's normalized phone and inactive/unlinked-profile checks; synthetic rows and Auth users were removed. Earlier local Storage HTTP integration passed **9/9** authorization and photo workflow checks; broader Edge Function checks passed 12/12 request/security cases, 7/7 public QR workflows, and 2/2 authenticated issuance/invitation workflows.
- Project B foundation structural comparison matches 15 tables, 157 columns, 117 constraints and 46 indexes. Full security equivalence remains blocked by global default privileges. Read-only role checks show the current `postgres` connection cannot change the defaults for `supabase_admin`; a Project B DBA/Supabase owner must provide a reviewed administrative path. Evidence is in `docs/migration/FOUNDATION_EQUIVALENCE.md` and `docs/migration/database-audit/12_default_privileges.txt`.
- `git diff --check` reports existing trailing whitespace in `RESQR-Mobile/screens/admin/AlertDetails.js` and `screens/guardian/AlertDetails.js`; those unrelated files were left untouched.
- No hosted database operation, migration-history repair, Edge Function deployment, hosted reset, or test against Project A occurred. Express remains the default backend.
- `.env` contents were not displayed. `git check-ignore` confirms actual `.env` files are ignored; `.env.example` files remain templates. Project B reference `jmzpqfgbjigbxkuofaae` is recorded in migration documentation.
- No Git reset, clean, checkout, source-code deletion, or commit was performed. Existing mobile/website changes were preserved.

## Recommended next steps

1. Have the Project B DBA/Supabase owner review `docs/migration/DEFAULT_PRIVILEGE_REMEDIATION_PLAN.md` and provide an administrative path for both default-ACL owners. Resolve the global mismatch and obtain explicit migration-history repair approval before any hosted change.
2. Decide whether the independent Kotlin starter has thesis value; approve archival/removal only after confirming ownership.
3. Decide whether the nested Vite starter under `RESQR-Mobile/web/` is still used for teaching or demos; approve archival/removal if not. Its dependencies are now patched and its build/lint pass.
4. Review the four dependency candidates before removing any packages; no package removal is required to clear current advisories.
5. Reconcile the mobile README's historical and current paths in a separate documentation pass.
6. Complete Android physical-device visual/accessibility verification and deployed-site QR integration after the Project B security gate is resolved.
7. Keep `RESQR2` source-only until it has its own safe Git repository boundary; never commit through the parent home-directory Git repository.

## Backend continuation and current cleanup status — 2026-11-26

- The active Supabase chain now has **12 migrations**: the foundation plus eleven forward implementation migrations, ending in `20261125138000_barangay_contacts.sql`. No filename or applied migration was changed. The chain and rollback-only pgTAP suite are described in `RESQR2/supabase/migrations/README.md`.
- Isolated local PostgreSQL/Supabase regression tests pass **135/135**. The contact suite has 19 checks, including cross-barangay denial and immediate public QR projection invalidation after phone changes. `supabase db lint --local` exits successfully with 13 existing warnings in unrelated functions; none names the new contact RPCs. No hosted project was linked for these tests.
- Latest mobile tests pass **23/23**. Standalone website tests pass **5/5**, and its Vite production build passes (23 modules). Express request-schema and source syntax checks pass; the Express suite remains incomplete (14 completed assertions before three test modules stalled), and full `tsc --noEmit` did not complete. Expo SDK 57 Android export stalled for over 19 minutes with no output and was stopped; copying the moved source tree to `/private/tmp` also stalled. These checks are not reported as passes.
- Local Edge Function coverage remains the earlier **12 request/security**, **7 public workflow**, and **2 authenticated issuance/invitation** checks; a further local `public-qr-view` missing-token validation smoke check passed **1/1**. Edge Function source was unchanged. No function was deployed.
- The latest registry dependency audits report **0 vulnerabilities** in all four packages. No dependency was removed in this cleanup.
- Project B default ACLs remain a deployment blocker. Structural foundation equivalence is established for the compared schema objects, while security equivalence is not: global defaults grant client privileges for `postgres` and `supabase_admin`. Only a Project B DBA/Supabase owner can provide the administrative remediation path for `supabase_admin`. Project B was not written, reset, or migration-repaired; Project A remains untouched; Express remains the default.
- This continuation removed four inventoried `.DS_Store` files from the workspace root and source-project directories. The existing root `.gitignore` already ignores `.DS_Store`, so no ignore-rule change was needed. `.DS_Store` files inside installed dependencies and nested `.git` metadata were left alone. Supabase lease/link/config files and build outputs were preserved.
- The complete file-purpose inventory remains `PROJECT_FILE_INVENTORY.csv` (350 file rows plus header); directory classification, deletion evidence, duplicate implementation findings, dependency review, approval-gated candidates, and the retirement checklist are above. No source code was deleted or moved in this continuation.
