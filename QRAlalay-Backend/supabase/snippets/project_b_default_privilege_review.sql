-- Project B default-privilege review.
-- All statements above the optional block are READ ONLY.
-- Run in the Project B SQL editor or a read-only SQL session.

-- COALESCE preserves the distinction between a global row and a schema row.
-- Expected interpretation: '<global>', 'public', and 'qralalay' are separate scopes.
select r.rolname as owner,
       coalesce(n.nspname, '<global>') as target_schema,
       case d.defaclobjtype
         when 'r' then 'TABLES'
         when 'S' then 'SEQUENCES'
         when 'f' then 'FUNCTIONS'
         when 'T' then 'TYPES'
         when 'n' then 'SCHEMAS'
       end as object_type,
       d.defaclacl::text as configured_default_acl,
       (select string_agg(
          case when x.grantee = 0 then 'PUBLIC'
               else pg_catalog.pg_get_userbyid(x.grantee) end
          || ':' || x.privilege_type
          || case when x.is_grantable then ':GRANTABLE' else '' end,
          ';' order by x.grantee, x.privilege_type, x.is_grantable)
        from pg_catalog.aclexplode(d.defaclacl) x) as privileges
from pg_catalog.pg_default_acl d
join pg_catalog.pg_roles r on r.oid = d.defaclrole
left join pg_catalog.pg_namespace n on n.oid = nullif(d.defaclnamespace, 0)
where r.rolname in ('postgres', 'supabase_admin')
  and coalesce(n.nspname, '<global>') in ('<global>', 'public', 'qralalay')
order by owner, target_schema, object_type;

-- Effective schema access. qralalay should not be usable by anon/authenticated.
select role_name,
       has_schema_privilege(role_name, 'qralalay', 'USAGE') as can_use_qralalay,
       has_schema_privilege(role_name, 'qralalay', 'CREATE') as can_create_in_qralalay
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

-- Application table owners/ACLs. App data should remain in qralalay.
select n.nspname as schema_name,
       c.relname as object_name,
       c.relkind as object_kind,
       owner.rolname as owner,
       coalesce(c.relacl::text, '(default ACL)') as object_acl,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_roles owner on owner.oid = c.relowner
where n.nspname in ('public', 'qralalay')
  and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
order by n.nspname, c.relname;

-- Extensions and ownership: review public-schema extension objects separately.
select e.extname,
       n.nspname as extension_schema,
       owner.rolname as extension_owner
from pg_catalog.pg_extension e
join pg_catalog.pg_namespace n on n.oid = e.extnamespace
join pg_catalog.pg_roles owner on owner.oid = e.extowner
order by n.nspname, e.extname;

-- Review every public RPC's ACL and SECURITY DEFINER setting.
select n.nspname as schema_name,
       p.proname as function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       owner.rolname as owner,
       p.prosecdef as security_definer,
       p.proconfig as function_settings,
       coalesce(p.proacl::text, '(default ACL)') as function_acl
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles owner on owner.oid = p.proowner
where n.nspname in ('public', 'qralalay')
order by n.nspname, p.proname, arguments;

-- MANUAL REVIEW ONLY — do not run this block directly.
-- If the Project B owner approves future-object hardening, test this as a new,
-- versioned migration in an isolated stack configured with the captured ACLs.
-- It affects defaults only for objects created by postgres; it does not alter
-- existing object grants and does not change supabase_admin's managed defaults.
--
-- begin;
-- alter default privileges for role postgres
--   revoke execute on functions from public;
-- alter default privileges for role postgres in schema public
--   revoke all on tables from anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   revoke all on sequences from anon, authenticated, service_role;
-- alter default privileges for role postgres in schema public
--   revoke execute on functions from anon, authenticated, service_role;
-- commit;
--
-- Before any deployment, prove all intentionally callable public RPCs retain
-- explicit grants and test that future public tables/sequences/functions are
-- not exposed. Keep application tables in the private qralalay schema.
