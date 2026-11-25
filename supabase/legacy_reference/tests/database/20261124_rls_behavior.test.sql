BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

-- Synthetic accounts and records only. The transaction rolls back after the
-- role-specific checks, leaving the local database unchanged.
INSERT INTO auth.users (id, email)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'rls-active-a@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'rls-active-b@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'rls-disabled@example.test');

INSERT INTO public.barangays (id, name, municipality, province, is_active)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Synthetic North', 'Test Municipality', 'Test Province', TRUE),
  ('20000000-0000-4000-8000-000000000002', 'Synthetic South', 'Test Municipality', 'Test Province', TRUE);

INSERT INTO public.profiles (id, barangay_id, full_name, role, is_active)
VALUES
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Synthetic Active A', 'barangay_official', TRUE),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Synthetic Active B', 'barangay_official', TRUE),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Synthetic Disabled', 'guardian', FALSE);

INSERT INTO public.barangay_contacts
  (id, barangay_id, label, phone_number, availability, is_public, is_active, verified_by, verified_at)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Synthetic public hotline', '+630000000001', 'Test only', TRUE, TRUE, '10000000-0000-4000-8000-000000000001', now()),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'Synthetic unverified hotline', '+630000000002', 'Test only', TRUE, TRUE, NULL, NULL),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'Synthetic private hotline', '+630000000003', 'Test only', FALSE, TRUE, '10000000-0000-4000-8000-000000000001', now()),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'Synthetic inactive hotline', '+630000000004', 'Test only', TRUE, FALSE, '10000000-0000-4000-8000-000000000001', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles),
  1,
  'an active account can read exactly its own profile'
);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles WHERE id = '10000000-0000-4000-8000-000000000002'),
  0,
  'an active account cannot read another account profile'
);
SELECT is(
  (SELECT count(*)::integer FROM public.barangays),
  1,
  'an active account can read only its assigned active barangay'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', TRUE);
SELECT is(
  (SELECT count(*)::integer FROM public.profiles),
  0,
  'a disabled account cannot read its profile'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::integer FROM public.barangay_contacts
   WHERE id IN (
     '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
     '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004'
   )),
  1,
  'anonymous readers see only an active, verified, approved public contact'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
