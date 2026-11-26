# Supabase migration state

Verified against Project B `jmzpqfgbjigbxkuofaae` on 2026-11-26 with the authenticated Supabase CLI. The remote migration ledger contains the first 12 local versions, from `20261124171158` through `20261125138000`. All 12 match local migration files. No migration repair is needed. The remote dry run lists exactly these three local pending migrations:

- `20261126002457_resident_patch_and_qr_reexport.sql`
- `20261126010000_role_scoped_responder_history.sql`
- `20261126011000_case_report_review_at_closure.sql`

The earlier audit notes claiming an empty migration ledger and an unresolved global default-privilege exposure are stale snapshots and are superseded by the live CLI/catalog checks above. Do not apply the foundation migration again or repair migration history.

## Current security catalog findings

- `public` has `USAGE` for `anon`, `authenticated`, and `service_role`, with no client `CREATE` privilege.
- `qralalay` is not usable by `anon` or `authenticated`; `service_role` has `USAGE`. No client role has schema `CREATE`.
- All 19 checked application tables/partitions have RLS enabled. `anon` and `authenticated` have no direct table CRUD grants. Expected server-only table permissions remain limited to `service_role`; internal tables use privileged server-side functions.
- No global default ACL rows were present. Existing `public` and platform schema defaults are scoped to those schemas; there is no `qralalay` schema default ACL grant to clients. This does not establish a general policy for future objects: continue explicit grants/revokes and inspect new function ACLs in migrations.
- Application RPC execution grants are role-scoped; no public application RPC was found executable by `anon`. The only anon-executable routine is platform event trigger `public.rls_auto_enable()`, owned by `postgres`, with `search_path=pg_catalog`; it is registered for DDL events and is not an app RPC. No corrective ACL migration is indicated by this finding.

These checks do not assert that every business workflow has passed live acceptance. New SQL in the three pending migrations remains untested until the isolated branch test step in [deployment](../../docs/deployment.md).

## Targeted pending migration scope

- `20261126002457`: partial resident editing, encrypted QR token storage, secure initial issuance/re-export reads, audit behavior, and legacy issue RPC revocation.
- `20261126010000`: role-scoped responder resident/case history, including denial for responders without assignment and role changes.
- `20261126011000`: official case closure reviews the selected report and records its audit in the same transaction.

The current hosted `issue-qr-card` still calls the legacy issue RPC. Deploy the updated `issue-qr-card` and new `export-qr-card` with the QR migration in one approved maintenance window. Exact commands, isolated test preparation, notification findings, and recovery steps are in [deployment](../../docs/deployment.md).
