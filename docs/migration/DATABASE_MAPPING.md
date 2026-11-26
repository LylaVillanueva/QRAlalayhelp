# QRAlalay Supabase database implementation

Updated: 2026-11-25.

## Target and foundation evidence

Project B (`jmzpqfgbjigbxkuofaae`) is the intended Supabase development target. Project A is outside this work and remains untouched. The supplied foundation snippet and active first migration have matching SHA-256 `65a207eed3f2e1474f93c4d062977e97e755b2d6b620137d9937b45b95d4b231`.

Read-only Project B catalog exports under `docs/migration/database-audit/` match the foundation's 15 tables, 157 columns, 117 constraints, 46 indexes, RLS settings, captured table/schema grants, and three linked Auth profiles. The `get_my_profile()` helper is owned by `postgres`, is `SECURITY DEFINER`, pins an empty `search_path`, and is executable by `authenticated` and `service_role`, not `anon`. The structural comparison passes. Complete security equivalence does not pass because Project B's global default ACLs grant broad table, sequence, and function privileges to `anon` and `authenticated` for objects created by `postgres` and `supabase_admin`; there are no `qralalay` schema-specific default ACL rows. Read-only role checks show `postgres` is not a superuser or member of `supabase_admin`, while `supabase_admin` can log in and is a superuser. The current connection cannot change the latter role's defaults. See [foundation equivalence](FOUNDATION_EQUIVALENCE.md) and [the default-privilege evidence](database-audit/12_default_privileges.txt).

The foundation SQL was applied manually in the hosted Dashboard. The remote migration ledger is empty. Do not run the foundation again or repair migration history without explicit approval. The CLI labels the configured Project B environment `production`; this is not authorization to write to it.

## Local implementation status

`QRAlalay-Backend/supabase/` is the active backend workspace. The isolated local Supabase chain currently contains eleven migrations: the foundation plus ten additive migrations for profile lookup, authorization, public QR requests, case workflows, notifications, Auth invitations, resident birth date, account contact fields, private photos, and verified phone invitations. All eleven replay successfully in the disposable Docker stack. pgTAP reports 116/116 passing security and transactional assertions, including QR revocation authorization, status transition, and audit logging. A separate local Storage HTTP test previously passed 9/9 privacy/upload/sign/delete checks and removed its synthetic rows and objects.

Mobile Supabase mode now maps resident birth date, account position/address and photos; email and phone-only account invitations use the Edge Function. Phone-only profiles stay inactive and unlinked until the invited number is verified; an official must then activate the account. The standalone QR website uses the public Edge Function service when configured. Android/web exports and the Vite website build pass. Express remains the default backend and is preserved. Edge Functions have not been deployed.

## Deployment gate

Project B has not received SQL, migrations, secrets, or function deployments. Before a hosted write, follow the [default-privilege remediation plan](DEFAULT_PRIVILEGE_REMEDIATION_PLAN.md): a reviewed forward-fix strategy must address the global default ACL mismatch for both object owner roles and establish that the resulting defaults are safe without breaking existing public API behavior. The available `postgres` role cannot change `supabase_admin` defaults, so the Project B DBA/Supabase owner must provide an administrative path for that role. Re-run the read-only catalog checks afterward. Migration-history repair is a separate action requiring explicit approval because the foundation was manually applied while the ledger is empty. Do not reset a hosted database.

An official can update their own sign-in email through Supabase Auth's verified self-service flow. Updating another invited user's sign-in address is not implemented; admin email mutation would bypass the user's verification flow. Physical Android visual/accessibility checks are also outstanding.

## Legacy data and business rules

No resident, QR token, case, notification, or test account rows were imported from Express. Continue using synthetic records only in local test transactions. Preserve Express services, routes, migrations, tests, and recovery data until feature parity, hosted deployment, device checks, recovery planning, and explicit retirement approval are complete.
