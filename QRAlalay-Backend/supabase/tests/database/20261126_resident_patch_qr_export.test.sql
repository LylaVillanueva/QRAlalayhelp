begin;
select plan(46);

insert into auth.users(id,email,email_confirmed_at) values
  ('91000000-0000-4000-8000-000000000001','resident-patch-official@example.test',now()),
  ('91000000-0000-4000-8000-000000000002','resident-patch-guardian@example.test',now());
insert into qralalay.barangays(id,name,is_active)
values ('92000000-0000-4000-8000-000000000001','Resident Patch Test Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active)
values
  ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
   '92000000-0000-4000-8000-000000000001','Patch Test Official','official',true),
  ('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002',
   '92000000-0000-4000-8000-000000000001','Patch Test Guardian','guardian',true);
insert into qralalay.residents(
  id,barangay_id,full_name,phone,address,resident_category,display_name,
  assistance_instructions,public_disclosure_approved,disclosure_approved_by,
  disclosure_approved_at,disclosure_reference,date_of_birth,created_by
) values (
  '94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
  'Patch Test Resident','09170000001','Old address','Senior','Resident name',
  'Keep medicine list with guardian',true,'93000000-0000-4000-8000-000000000001',
  now(),'Consent form 1','1990-01-02','93000000-0000-4000-8000-000000000001'
);
insert into qralalay.qr_cards(id,barangay_id,resident_id,token_hash,issued_by)
values ('95000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000001',repeat('a',64),'93000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select is((select assistance_instructions from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  'Keep medicine list with guardian','official edit details include private instructions');
select is((select assistance_instructions from public.get_resident_for_edit('94000000-0000-4000-8000-000000000001')),
  'Keep medicine list with guardian','mobile edit RPC includes private instructions');
select is((select public_disclosure_approved from public.get_resident_for_edit('94000000-0000-4000-8000-000000000001')),
  true,'mobile edit RPC includes disclosure state');
select ok((select bool_and(email_confirmed and has_auth_user) from public.list_barangay_profiles_with_status()),
  'official account status RPC reports verified Auth users');
select is((select public_disclosure_approved from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  true,'official edit details include disclosure state');
select is((select qr_card_reexportable from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  false,'legacy card is marked non-reexportable');
select is((select phone from public.update_resident_fields('94000000-0000-4000-8000-000000000001','{"phone":null}'::jsonb)),
  null::text,'explicit null clears an optional phone');
select is((select assistance_instructions from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  'Keep medicine list with guardian','omitted instructions remain unchanged');
select is((select date_of_birth from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  '1990-01-02'::date,'omitted date of birth remains unchanged');
select is((select public_disclosure_approved from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  true,'ordinary field update leaves disclosure approval unchanged');
select is((select date_of_birth from public.update_resident_fields('94000000-0000-4000-8000-000000000001','{"date_of_birth":null}'::jsonb)),
  null::date,'explicit null clears date of birth');
select throws_ok($test$select * from public.update_resident_fields(
  '94000000-0000-4000-8000-000000000001','{"public_disclosure_approved":false}'::jsonb)$test$,
  '22023','Unsupported resident update field','generic patch rejects disclosure approval fields');
select is((select public_disclosure_approved from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  true,'rejected patch does not change disclosure approval');
select is(public.set_resident_public_disclosure(
  '94000000-0000-4000-8000-000000000001',false,null,'Resident withdrew consent'),
  true,'explicit official disclosure revocation succeeds');
select is((select public_disclosure_approved from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  false,'explicit disclosure revocation is persisted');
select ok(not has_function_privilege('authenticated',
  'public.update_resident(uuid,text,text,text,text,text,text,boolean,text)','EXECUTE'),
  'unsafe full-replacement update RPC is no longer client-callable');

select set_config('qralalay.test_existing_link_id',public.create_guardian_link(
  '94000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','Parent')::text,true);
select is((select status from public.list_resident_guardian_links(
  '94000000-0000-4000-8000-000000000001') where link_id=current_setting('qralalay.test_existing_link_id')::uuid),
  'pending','mobile can retrieve pending existing-guardian links');
select is((select guardian_email from public.list_resident_guardian_links(
  '94000000-0000-4000-8000-000000000001') where link_id=current_setting('qralalay.test_existing_link_id')::uuid),
  'resident-patch-guardian@example.test','guardian list resolves an existing Auth email');
select is((select guardian_email_confirmed from public.list_resident_guardian_links(
  '94000000-0000-4000-8000-000000000001') where link_id=current_setting('qralalay.test_existing_link_id')::uuid),
  true,'guardian list reports confirmed email separately from relationship status');
reset role;
select is((select status from qralalay.guardian_links where id=current_setting('qralalay.test_existing_link_id')::uuid),
  'pending','existing guardian selection creates a pending link');
set local role authenticated;
select is(public.review_guardian_link(current_setting('qralalay.test_existing_link_id')::uuid,
  'verified','Official verified selected guardian'),true,'official can verify an existing-guardian link');
reset role;
select is((select status from qralalay.guardian_links where id=current_setting('qralalay.test_existing_link_id')::uuid),
  'verified','existing-guardian link is persisted as verified');
set local role authenticated;
select is((select guardian_id from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')),
  '93000000-0000-4000-8000-000000000002'::uuid,'verified guardian appears in official details');
select set_config('qralalay.test_invited_profile_id',public.create_profile_invitation(
  'invited-guardian@example.test','Invited Guardian',null,'guardian',
  array['94000000-0000-4000-8000-000000000001'::uuid],'Parent')::text,true);
reset role;
select ok(not (select is_active from qralalay.profiles where id=current_setting('qralalay.test_invited_profile_id')::uuid),
  'invited guardian remains inactive before account verification');
select set_config('qralalay.test_invited_link_id',(
  select id::text from qralalay.guardian_links
  where guardian_id=current_setting('qralalay.test_invited_profile_id')::uuid
    and resident_id='94000000-0000-4000-8000-000000000001' and status='pending'
),true);
select is((select guardian_email from public.list_resident_guardian_links(
  '94000000-0000-4000-8000-000000000001') where link_id=current_setting('qralalay.test_invited_link_id')::uuid),
  'invited-guardian@example.test','guardian list resolves invitation email');
select is((select guardian_email_confirmed from public.list_resident_guardian_links(
  '94000000-0000-4000-8000-000000000001') where link_id=current_setting('qralalay.test_invited_link_id')::uuid),
  false,'unclaimed invitation is not reported as email-confirmed');
set local role authenticated;
select is(public.review_guardian_link(current_setting('qralalay.test_invited_link_id')::uuid,
  'verified','Official verified invited guardian relationship'),true,
  'official can verify an invitation-created guardian link');
reset role;
select ok(not (select is_active from qralalay.profiles where id=current_setting('qralalay.test_invited_profile_id')::uuid),
  'relationship verification does not activate the invited account');
set local role authenticated;
select is(public.issue_qr_card_secure(
  '96000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',
  repeat('b',64),'v1.'||repeat('A',16)||'.'||repeat('B',79)
),'96000000-0000-4000-8000-000000000001'::uuid,'secure issuance returns the requested card ID');
select is((select status from public.get_resident_qr_card('94000000-0000-4000-8000-000000000001')),
  'active','mobile QR status RPC returns the active card state');
select is((select issued_by_name from public.get_resident_qr_card('94000000-0000-4000-8000-000000000001')),
  'Patch Test Official','mobile QR status RPC returns issuing official name');
reset role;
select is((select status from qralalay.qr_cards where id='95000000-0000-4000-8000-000000000001'),
  'revoked','intentional new issuance revokes the prior active card');
select ok((select encrypted_token is not null from qralalay.qr_cards where id='96000000-0000-4000-8000-000000000001'),
  'new card stores ciphertext');
select is((select token_hash from qralalay.qr_cards where id='96000000-0000-4000-8000-000000000001'),
  repeat('b',64),'new card retains the public-lookup token hash');
set local role authenticated;
select ok((public.get_qr_card_for_export('96000000-0000-4000-8000-000000000001')->>'reexportable')::boolean,
  'authorized official can retrieve encrypted export material');
select is((public.get_qr_card_for_export('96000000-0000-4000-8000-000000000001') ? 'token'),false,
  'database export RPC never returns a raw QR token');
reset role;
select is((select status from qralalay.qr_cards where id='96000000-0000-4000-8000-000000000001'),
  'active','exporting the card leaves its active status unchanged');
select ok(exists(select 1 from qralalay.audit_logs where action='qr_card.export_requested'
  and target_id='96000000-0000-4000-8000-000000000001'),
  'authorized QR export request is audited');
select ok(not has_function_privilege('authenticated','public.issue_qr_card(uuid,text)','EXECUTE'),
  'legacy unsecured issuance RPC is no longer client-callable');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select throws_ok($test$select public.get_qr_card_for_export('95000000-0000-4000-8000-000000000001')$test$,
  'P0002','Active QR card not found','revoked legacy card cannot be re-exported');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select throws_ok($test$select * from public.get_resident_edit_details('94000000-0000-4000-8000-000000000001')$test$,
  '42501','Active official profile required','guardian cannot retrieve official-only edit details');
select throws_ok($test$select * from public.get_resident_for_edit('94000000-0000-4000-8000-000000000001')$test$,
  '42501','Active official profile required','guardian cannot retrieve mobile edit details');
select throws_ok($test$select * from public.list_resident_guardian_links('94000000-0000-4000-8000-000000000001')$test$,
  '42501','Active official profile required','guardian cannot list protected relationship links');
select throws_ok($test$select * from public.list_barangay_profiles_with_status()$test$,
  '42501','Active official profile required','guardian cannot list account verification status');
select throws_ok($test$select * from public.get_resident_qr_card('94000000-0000-4000-8000-000000000001')$test$,
  '42501','Active official profile required','guardian cannot access official QR card status');
select throws_ok($test$select public.get_qr_card_for_export('96000000-0000-4000-8000-000000000001')$test$,
  '42501','Active official profile required','guardian cannot export official QR credentials');

select * from finish();
rollback;
