BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

SELECT ok(
  (SELECT count(*) = 17 AND bool_and(relrowsecurity)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN (
       'audit_logs', 'barangays', 'incident_cancellations', 'incident_confirmations',
       'incident_guardian_followups', 'incident_location_shares', 'incident_outcomes',
       'incident_responses', 'incidents', 'otp_codes', 'otp_request_log', 'push_tokens',
       'qr_tokens', 'refresh_tokens', 'residents', 'schema_migrations', 'users'
     )),
  'RLS is enabled on every legacy base table'
);

SELECT ok(
  (SELECT count(*) = 17 AND bool_and(
    NOT has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
    AND NOT has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT')
  )
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN (
       'audit_logs', 'barangays', 'incident_cancellations', 'incident_confirmations',
       'incident_guardian_followups', 'incident_location_shares', 'incident_outcomes',
       'incident_responses', 'incidents', 'otp_codes', 'otp_request_log', 'push_tokens',
       'qr_tokens', 'refresh_tokens', 'residents', 'schema_migrations', 'users'
     )),
  'anonymous and authenticated roles have no direct SELECT on legacy tables'
);

SELECT ok(
  (SELECT count(*) = 12 AND bool_and(relrowsecurity AND relforcerowsecurity)
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN (
       'profiles', 'barangay_contacts', 'guardian_links', 'qr_cards',
       'assistance_cases', 'case_assignments', 'safety_observations',
       'case_reports', 'case_events', 'device_tokens', 'notifications', 'notification_outbox'
     )),
  'RLS is enabled and forced on every new target table'
);

SELECT ok(
  (SELECT count(*) = 10 AND bool_and(
    NOT has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT')
    AND NOT has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT')
  )
   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname IN (
       'guardian_links', 'qr_cards', 'assistance_cases', 'case_assignments',
       'safety_observations', 'case_reports', 'case_events', 'device_tokens',
       'notifications', 'notification_outbox'
     )),
  'anonymous and authenticated roles have no direct SELECT on private target tables'
);

SELECT ok(NOT has_table_privilege('anon', 'public.residents', 'SELECT'), 'anonymous cannot select resident records');
SELECT ok(NOT has_table_privilege('authenticated', 'public.users', 'SELECT'), 'signed-in clients cannot select legacy accounts');
SELECT ok(NOT has_table_privilege('authenticated', 'public.residents', 'SELECT'), 'signed-in clients cannot select resident base rows');
SELECT ok(NOT has_table_privilege('authenticated', 'public.assistance_cases', 'SELECT'), 'signed-in clients cannot select case base rows');
SELECT ok(NOT has_table_privilege('authenticated', 'public.qr_cards', 'SELECT'), 'signed-in clients cannot select QR token digests');
SELECT ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'signed-in clients may request their own profile');
SELECT ok(NOT has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous clients cannot select application profiles');
SELECT ok(NOT has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'clients cannot change profile role or active status');
SELECT ok(has_column_privilege('authenticated', 'public.profiles', 'role', 'SELECT'), 'a signed-in user can read their own role through the RLS-protected profile row');
SELECT ok(has_column_privilege('anon', 'public.barangay_contacts', 'phone_number', 'SELECT'), 'public clients may read the approved hotline field');
SELECT ok(NOT has_column_privilege('anon', 'public.barangay_contacts', 'verified_by', 'SELECT'), 'public clients cannot read contact verifier identity');

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_read_own_active'),
  'profile policy restricts reads to the current active account'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'barangay_contacts' AND policyname = 'barangay_contacts_read_approved_public'),
  'public contact policy requires approval, active state, and verification'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_case_assignments_one_active_primary'),
  'the database has a unique index for one active primary assignment per case'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qr_cards'::regclass AND contype = 'u'),
  'QR digests are unique'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.assistance_cases'::regclass AND conname = 'assistance_cases_idempotency_key_key'),
  'assistance request idempotency keys are unique'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_notification_outbox_ready'),
  'pending notification work has a retry scheduling index'
);

SELECT * FROM finish();
ROLLBACK;
