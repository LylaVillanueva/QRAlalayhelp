begin;
select plan(15);

insert into auth.users(id,email) values
  ('91100000-0000-4000-8000-000000000001','history-official@example.test'),
  ('91100000-0000-4000-8000-000000000002','history-responder-a@example.test'),
  ('91100000-0000-4000-8000-000000000003','history-responder-b@example.test'),
  ('91100000-0000-4000-8000-000000000004','history-guardian@example.test'),
  ('91100000-0000-4000-8000-000000000005','history-outsider@example.test'),
  ('91100000-0000-4000-8000-000000000006','history-inactive@example.test');
insert into qralalay.barangays(id,name,is_active)
values ('92100000-0000-4000-8000-000000000001','History Test Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active) values
  ('93100000-0000-4000-8000-000000000001','91100000-0000-4000-8000-000000000001','92100000-0000-4000-8000-000000000001','History Official','official',true),
  ('93100000-0000-4000-8000-000000000002','91100000-0000-4000-8000-000000000002','92100000-0000-4000-8000-000000000001','History Responder A','responder',true),
  ('93100000-0000-4000-8000-000000000003','91100000-0000-4000-8000-000000000003','92100000-0000-4000-8000-000000000001','History Responder B','responder',true),
  ('93100000-0000-4000-8000-000000000004','91100000-0000-4000-8000-000000000004','92100000-0000-4000-8000-000000000001','History Guardian','guardian',true),
  ('93100000-0000-4000-8000-000000000005','91100000-0000-4000-8000-000000000005','92100000-0000-4000-8000-000000000001','History Outsider','responder',true),
  ('93100000-0000-4000-8000-000000000006','91100000-0000-4000-8000-000000000006','92100000-0000-4000-8000-000000000001','History Inactive','responder',false);
insert into qralalay.residents(id,barangay_id,full_name,created_by,phone,address)
values ('94100000-0000-4000-8000-000000000001','92100000-0000-4000-8000-000000000001','History Resident','93100000-0000-4000-8000-000000000001','private-phone','private-address');
insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status,verified_by,verified_at)
values ('92100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000004','Parent','verified','93100000-0000-4000-8000-000000000001',now());
insert into qralalay.assistance_cases(id,barangay_id,resident_id,status)
values
  ('96100000-0000-4000-8000-000000000001','92100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000001','in_progress'),
  ('96100000-0000-4000-8000-000000000002','92100000-0000-4000-8000-000000000001','94100000-0000-4000-8000-000000000001','in_progress');
insert into qralalay.case_assignments(barangay_id,case_id,responder_id,assigned_by,status,accepted_at)
values
  ('92100000-0000-4000-8000-000000000001','96100000-0000-4000-8000-000000000001','93100000-0000-4000-8000-000000000002','93100000-0000-4000-8000-000000000001','accepted',now()),
  ('92100000-0000-4000-8000-000000000001','96100000-0000-4000-8000-000000000002','93100000-0000-4000-8000-000000000003','93100000-0000-4000-8000-000000000001','accepted',now());

set local role authenticated;
select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_accessible_residents_with_photos()
  where resident_id='94100000-0000-4000-8000-000000000001'),1,
  'assigned responder can see the resident through the permitted listing RPC');
select is((select case_id from public.get_assistance_case('96100000-0000-4000-8000-000000000001')),
  '96100000-0000-4000-8000-000000000001'::uuid,
  'responder can retrieve a case assigned to their profile through the public RPC');
select throws_ok($test$select * from public.get_assistance_case('96100000-0000-4000-8000-000000000002')$test$,
  '42501','Not authorized for this case',
  'responder cannot retrieve another responder case for the same resident');
select is((select count(*)::int from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')),1,
  'responder history returns only their assigned case');
select is((select case_id from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')),
  '96100000-0000-4000-8000-000000000001'::uuid,'responder history contains their own case ID only');

select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000003',true);
select is((select case_id from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')),
  '96100000-0000-4000-8000-000000000002'::uuid,'second responder receives only their separate case');

select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from public.list_accessible_residents_with_photos()),0,
  'unrelated responder cannot enumerate the resident profile or guardian contact');
select throws_ok($test$select * from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')$test$,
  '42501','Not authorized for this resident','unrelated responder cannot retrieve resident history by ID');
select throws_ok($test$select * from public.get_assistance_case('96100000-0000-4000-8000-000000000001')$test$,
  '42501','Not authorized for this case','unrelated responder cannot retrieve a case by ID');

select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')),2,
  'verified guardian retains full history for their linked resident');

select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')),2,
  'same-barangay official retains full resident history');

reset role;
update qralalay.case_assignments set status='completed',ended_at=now()
where responder_id='93100000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000001',true);
select ok(public.change_profile_role('93100000-0000-4000-8000-000000000002','resident',
  'Responder role ended after completed assignments'),
  'official can change role after the responder assignment is completed');
select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.list_accessible_residents_with_photos()
  where resident_id='94100000-0000-4000-8000-000000000001'),0,
  'old responder assignments do not preserve resident access after role change');
select throws_ok($test$select * from public.get_assistance_case('96100000-0000-4000-8000-000000000001')$test$,
  '42501','Not authorized for this case','old responder assignment does not preserve case access after role change');

select set_config('request.jwt.claim.sub','91100000-0000-4000-8000-000000000006',true);
select throws_ok($test$select * from public.list_resident_case_history('94100000-0000-4000-8000-000000000001')$test$,
  '42501','Active profile required','inactive responder cannot retrieve resident history');

select * from finish();
rollback;
