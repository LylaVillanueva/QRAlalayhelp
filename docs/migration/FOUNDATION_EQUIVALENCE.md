# Foundation equivalence verification

Run date: 2026-11-25. Target: Project B (`jmzpqfgbjigbxkuofaae`). The hosted catalog reads were performed in read-only mode. No hosted database was reset, repaired, or modified.

## Result

| Scope | Result | Evidence |
|---|---|---|
| Supplied foundation file identity | Pass | `QRAlalay-Backend/supabase/snippets/001_qralalay_foundation.sql` and `QRAlalay-Backend/supabase/migrations/20261124171158_qralalay_foundation.sql` both hash to `65a207eed3f2e1474f93c4d062977e97e755b2d6b620137d9937b45b95d4b231`. |
| Tables and columns | Pass | 15 tables and 157 columns match the read-only catalog export. |
| Constraints and indexes | Pass | 117 constraints and 46 indexes match. |
| RLS and captured grants | Pass | Table RLS settings, schema privileges, table privileges, and three linked Auth profiles match the captured foundation state. |
| `get_my_profile()` helper | Pass | Owner `postgres`; `SECURITY DEFINER`; empty `search_path`; execute granted to `authenticated` and `service_role`, not `anon`. |
| Default privileges | **Fail / deployment blocker** | Global TABLES, SEQUENCES, and FUNCTIONS defaults exist for `postgres` and `supabase_admin`. The expanded ACLs grant broad object access to `anon` and `authenticated`. No `qralalay`-specific default ACL rows exist. |

## Interpretation

The supplied SQL is byte-for-byte identical to the candidate foundation, and the captured structural catalog matches. Full least-privilege equivalence is not established: the candidate's schema-scoped revokes cannot cancel grants inherited from global default privileges. Objects created by either owner can therefore receive client privileges beyond the intended schema restrictions.

The follow-up role check found `postgres` is not a superuser and is not a member of `supabase_admin`; `supabase_admin` can log in and is a superuser. The currently available `postgres` role cannot remediate the `supabase_admin` defaults. A Project B DBA/Supabase owner must provide a reviewed administrative path for that owner before default-privilege equivalence can pass.

This finding does not authorize an ACL change. A forward strategy must review the effect on all schemas and existing public API behavior, address both owners, and pass a new read-only verification before any hosted migration. The remote migration ledger is empty although the foundation was manually applied. Do not replay the foundation or repair the ledger without explicit approval.

## Evidence files

- Catalog exports: `docs/migration/database-audit/01_tables.csv` through `13_helper_function_owner.csv`.
- Default ACL results: `docs/migration/database-audit/12_default_privileges.csv` and `12_default_privileges.txt`.
- Migration ledger query result: `docs/migration/database-audit/10_migration_history`.
