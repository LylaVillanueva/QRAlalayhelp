# Project B deployment

Target: Project B `jmzpqfgbjigbxkuofaae` (CLI environment label: `production`). The live CLI ledger was checked on 2026-11-26: the first 12 repository migrations are recorded remotely, and only the three migrations below are pending. A CLI dry run against the explicit Project B ref listed exactly these three migrations. The earlier notes saying the ledger was empty, or that global default privileges create an unresolved client-grant issue, are superseded by that live catalog inspection. No hosted writes have been made for this release.

## Verified pending release

- `20261126002457_resident_patch_and_qr_reexport.sql`
- `20261126010000_role_scoped_responder_history.sql`
- `20261126011000_case_report_review_at_closure.sql`
- Deploy updated `issue-qr-card` and new `export-qr-card`.

The currently deployed `issue-qr-card` is the older v1 and calls the legacy RPC. The local updated function calls `issue_qr_card_secure`; the pending QR migration revokes the legacy issue RPC. Apply the migration and deploy both QR functions in one maintenance window. Pause QR issuance during the short gap between database apply and successful activation of the updated issue function. Do not call issue to re-export an existing card.

## Read-only verification commands

Run from `QRAlalay-Backend/`:

```sh
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase migration list --remote=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db push --dry-run --remote=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase functions list --project-ref=jmzpqfgbjigbxkuofaae
```

Recheck the target and exact three migration list immediately before an approved deployment. Do not run `migration repair`: the hosted ledger already matches the first 12 local versions.

## Database tests before production

Docker, local PostgreSQL, `psql`, `pg_prove`, and Deno are not installed in this environment. The three pending database test suites have therefore not been executed. Do not run them against Project B production. After approval, use a no-data Preview Branch (omit `--with-data`) as the isolated PostgreSQL environment. Confirm the branch region/size and current branch schema/ledger before proceeding. The tests use synthetic rows and transactional rollback; stop if their fixtures require production data.

```sh
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase branches create qralalay-release-check --remote=jmzpqfgbjigbxkuofaae --region ap-southeast-1 --size small
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase branches list --project-ref=jmzpqfgbjigbxkuofaae
```

Use the preview branch ref returned by `branches list` below as `<BRANCH_REF>`. Verify it belongs to Project B, is data-less, and has the expected first-12 migration baseline. Then:

```sh
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db push --remote=<BRANCH_REF>
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase test db --remote=<BRANCH_REF> supabase/tests/database/20261126_resident_patch_qr_export.test.sql supabase/tests/database/20261126_responder_history_scope.test.sql supabase/tests/database/20261125_workflow_security.test.sql
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase branches delete <BRANCH_REF> --remote=jmzpqfgbjigbxkuofaae
```

The test command may enable pgTAP and writes test fixtures on the branch. Delete the isolated branch after collecting results. Do not continue to production if branch creation, baseline verification, or any test fails. This avoids Docker and never runs destructive suites on production. Supabase documents Preview Branches as isolated environments with production data excluded by default; the CLI supports `test db --remote` for remote test targets ([branching](https://supabase.com/docs/guides/deployment/branching), [database testing](https://supabase.com/docs/guides/database/testing)).

## Consolidated production deployment — requires explicit approval

The live secret-name check found `QR_CARD_ENCRYPTION_KEY_V1` absent. Existing Project B secrets must be preserved. After isolated tests pass, generate a single 32-byte Base64 key only once, store it in an approved secret manager, and set that exact name. Never print, commit, rotate, or regenerate it if it has since been configured. Do not copy the key into the app or website. Losing this versioned key prevents re-export of cards encrypted with it.

Prepare a permission-restricted temporary env file that contains only `QR_CARD_ENCRYPTION_KEY_V1=<generated Base64 key>`; generate the key directly into that file without echoing it to the terminal or shell history. The installed CLI supports `--env-file`. Keep the file out of the repository and remove it after confirming the secret name was set.

With QR issuance paused and approval covering the secret update, exact migrations, and two function deployments:

```sh
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase secrets set --env-file=/private/tmp/qralalay-project-b-secrets.env --project-ref=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase db push --remote=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase functions deploy issue-qr-card --use-api --remote=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase functions deploy export-qr-card --use-api --remote=jmzpqfgbjigbxkuofaae
SUPABASE_TELEMETRY_DISABLED=1 ./node_modules/.bin/supabase functions list --project-ref=jmzpqfgbjigbxkuofaae
```

Keep JWT verification enabled. Do not deploy all functions, use `--prune`, or run `migration repair`. Recheck the secret by name only; never display values.

## Notifications and acceptance

Project B has `NOTIFICATION_WORKER_SECRET`, but this review found no `pg_cron`/`pg_net` extension or database cron schedule. No external scheduler was verifiable. The worker is deployed with `verify_jwt=false` and authenticates its secret header. `EXPO_ACCESS_TOKEN` is absent and optional for the Expo push integration; without provider configuration and device receipt checks, do not claim push delivery is operational. Before release, decide the approved external scheduler and configure it to call `notification-worker` using the existing worker secret, or explicitly accept a manually invoked worker. Do not rotate the worker secret as part of this release.

After deployment, verify resident partial editing, QR status/export, public QR scan, responder case-history isolation, and report review during closure. Existing QR cards without retained encrypted token material return HTTP 409 `QR_EXPORT_UNAVAILABLE`; preserve their printed cards or deliberately issue a replacement under normal authorization.

## Recovery

Capture a pre-deployment schema/database backup using the project's approved backup process and retain the successful CLI output. If branch tests fail, delete the branch and make no production changes. If the secret cannot be set, stop before DB migration. If migration succeeds but either function deployment fails, keep QR issuance paused and retry the updated function deployment; do not restore the old function because its legacy RPC is revoked. Use a forward corrective migration if a schema defect is found; never delete migration history or drop encrypted token data as a rollback shortcut. Preserve the key and all existing secrets.
