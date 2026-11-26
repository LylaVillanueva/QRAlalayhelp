begin;
select plan(11);

insert into auth.users (id,email,email_confirmed_at) values
  ('81000000-0000-4000-8000-000000000011','phone-official@example.test',now());
insert into qralalay.barangays(id,name,is_active)
values ('82000000-0000-4000-8000-000000000011','Phone Invitation Test Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active)
values ('83000000-0000-4000-8000-000000000011','81000000-0000-4000-8000-000000000011',
  '82000000-0000-4000-8000-000000000011','Phone Test Official','official',true);
insert into qralalay.residents(id,barangay_id,full_name,created_by,public_disclosure_approved)
values ('84000000-0000-4000-8000-000000000011','82000000-0000-4000-8000-000000000011',
  'Phone Test Resident','83000000-0000-4000-8000-000000000011',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000011',true);
select ok(set_config('qralalay.test_phone_profile_id',public.create_profile_phone_invitation_with_work_info(
  '+639171234567','Phone Test Guardian','guardian',array['84000000-0000-4000-8000-000000000011'::uuid],
  'Parent',null,null)::text,true) <> '',
  'an active official can create a phone-only guardian invitation');
reset role;
select is((select role||'|'||is_active::text||'|'||phone||'|'||coalesce(home_address,'')
  from qralalay.profiles where id=current_setting('qralalay.test_phone_profile_id')::uuid),
  'guardian|false|+639171234567|','phone invite creates an inactive profile with the phone contact');
select is((select status from qralalay.guardian_links
  where guardian_id=current_setting('qralalay.test_phone_profile_id')::uuid),
  'pending','the invited guardian relationship remains pending verification');
select ok(not has_table_privilege('authenticated','qralalay.profile_invitation_phones','SELECT'),
  'authenticated users cannot read the private phone invitation table');
reset role;
insert into auth.users (id,phone) values
  ('81000000-0000-4000-8000-000000000012','639171234567'),
  ('81000000-0000-4000-8000-000000000013','639171234568');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000013',true);
select throws_ok($test$select public.create_profile_phone_invitation_with_work_info(
  '+639171234569','Phone Test Official','official','{}'::uuid[],null,null,null)$test$,
  '42501','Active official profile required','only an official can create a phone invitation');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000012',true);
select throws_ok($test$select public.claim_phone_invitation()$test$,
  '42501','A verified phone number is required','an unverified phone Auth user cannot claim a profile');

reset role;
update auth.users set phone_confirmed_at=now()
where id='81000000-0000-4000-8000-000000000012';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000012',true);
select ok(public.claim_phone_invitation(),'a verified phone Auth user can claim only its matching invitation');
reset role;
select is((select auth_user_id from qralalay.profiles
  where id=current_setting('qralalay.test_phone_profile_id')::uuid),
  '81000000-0000-4000-8000-000000000012'::uuid,'claim links the verified Auth user');
select ok(not (select is_active from qralalay.profiles
  where id=current_setting('qralalay.test_phone_profile_id')::uuid),
  'phone verification alone does not activate the profile');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000011',true);
select is(public.set_profile_active(current_setting('qralalay.test_phone_profile_id')::uuid,true,
  'Phone owner verified their number'), '81000000-0000-4000-8000-000000000012'::uuid,
  'an official can activate the profile after phone verification');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000012',true);
select is((select profile_id from public.get_my_profile()),
  current_setting('qralalay.test_phone_profile_id')::uuid,'the active phone-linked Auth user resolves to its profile');

select * from finish();
rollback;
