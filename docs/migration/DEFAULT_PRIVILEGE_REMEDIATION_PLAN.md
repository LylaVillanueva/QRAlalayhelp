# Project B default-privilege remediation plan

Status: prepared for review; no hosted SQL or migration has been run.

## Verified finding

The read-only Project B catalog query found global default ACLs for TABLES, SEQUENCES, and FUNCTIONS under both `postgres` and `supabase_admin`. The expanded ACLs include `anon` and `authenticated`; there are no schema-specific default ACL rows for `qralalay`. The foundation's per-schema `REVOKE` statements cannot cancel these global defaults.

A follow-up role-capability query confirmed that Project B `postgres` is not a superuser and is not a member of `supabase_admin`; `supabase_admin` is a superuser and can log in. The current `postgres` connection therefore cannot change `supabase_admin`'s default ACLs. A DBA/Supabase owner with access to that role must provide a reviewed administrative path. This is a permission boundary, not a reason to attempt role switching or other hosted writes. The `postgres` role can still manage its own defaults, subject to project-wide review and approval.

PostgreSQL 17 documentation confirms that schema-specific default privileges are added to global defaults, and that a schema-scoped `REVOKE` cannot remove a global default grant. See [ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

## Candidate strategy for DBA review

1. Have the Project B DBA/Supabase owner confirm the administrative path for each owner. The currently available `postgres` role cannot alter `supabase_admin` defaults. Re-read the ACLs, role memberships, and schema ownership immediately before preparing SQL.
2. Inventory actual `public` objects and every explicit grant used by QRAlalay clients and Supabase-managed services. Current QRAlalay API functions use explicit grants; verify that no service relies on implicit global defaults.
3. Test in an isolated database configured with the same default ACL rows and relevant owners. Create test tables, sequences, and functions under each owner in `qralalay`, `public`, and Supabase-managed schemas. Verify that clients receive no unintended access and that existing required APIs remain callable.
4. Have the Project B owner/DBA review the project-wide effect of removing global client defaults for both owners. Do not assume a `qralalay`-only schema revoke can fix this finding.
5. Only after review and explicit approval, prepare a forward-only SQL change that removes the unintended default grants and adds narrowly scoped explicit grants required by confirmed services. Do not alter existing object grants or the manually applied foundation as part of the default ACL fix.
6. Re-run the read-only catalog checks and direct privilege tests. Keep migration-history repair as a separate approved step because the remote ledger is empty.

## Deployment gate

This finding can affect future object creation across schemas, so a single generic `ALTER DEFAULT PRIVILEGES` statement is not yet approved as safe for Project B. The available `postgres` role lacks authority over `supabase_admin` defaults, so remediation cannot be completed through the current connection alone. No remediation SQL has been added to active migrations and no hosted operation is authorized by this plan. Project B remains untouched; Project A, the remote migration ledger, and hosted Edge Function state are unchanged.
