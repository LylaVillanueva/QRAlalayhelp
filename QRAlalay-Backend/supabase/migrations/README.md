# Supabase migration state

Project B `jmzpqfgbjigbxkuofaae` has 15 applied migrations through `20261126011000_case_report_review_at_closure.sql`. This change adds `20261126012000_guardian_approval_and_resend.sql` as the next local migration. It has not been deployed; apply it only after the required isolated tests pass and the owner approves deployment. Do not repair migration history or modify earlier migrations.

## Current security catalog findings

- `public` has `USAGE` for `anon`, `authenticated`, and `service_role`, with no client `CREATE` privilege.
- `qralalay` is not usable by `anon` or `authenticated`; `service_role` has `USAGE`. No client role has schema `CREATE`.
- All 19 checked application tables/partitions have RLS enabled. `anon` and `authenticated` have no direct table CRUD grants. Expected server-only table permissions remain limited to `service_role`; internal tables use privileged server-side functions.
- No global default ACL rows were present. Existing `public` and platform schema defaults are scoped to those schemas; there is no `qralalay` schema default ACL grant to clients. This does not establish a general policy for future objects: continue explicit grants/revokes and inspect new function ACLs in migrations.
- Application RPC execution grants are role-scoped; no public application RPC was found executable by `anon`. The only anon-executable routine is platform event trigger `public.rls_auto_enable()`, owned by `postgres`, with `search_path=pg_catalog`; it is registered for DDL events and is not an app RPC. No corrective ACL migration is indicated by this finding.

These checks do not assert that every business workflow has passed live acceptance. The new guardian workflow migration must pass the isolated SQL and Edge Function tests before deployment.

## Guardian approval and resend scope

- `20261126012000`: official-only relationship approval at registration/linking, in-place confirmation for existing pending links, account activation/email confirmation gates, and rate-limited audited resend preparation.
- Updated `invite-account`: accepts the explicit approved-registration contract while retaining its existing pending-link path for older clients.
- New `resend-guardian-invitation`: resends only an existing linked, inactive, unconfirmed guardian account; it does not create or replace Auth users.

The migration and functions require approval before production deployment. No hosted resource was changed for this work.
