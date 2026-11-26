begin;
select plan(42);

-- Synthetic Auth, resident and case fixtures only. The entire test rolls back.
insert into auth.users (id,email) values
  ('81000000-0000-4000-8000-000000000001','official@example.test'),
  ('81000000-0000-4000-8000-000000000002','responder@example.test'),
  ('81000000-0000-4000-8000-000000000003','guardian@example.test'),
  ('81000000-0000-4000-8000-000000000004','outsider@example.test');
insert into qralalay.barangays(id,name,is_active) values
  ('82000000-0000-4000-8000-000000000001','Synthetic Test Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active) values
  ('83000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Synthetic Official','official',true),
  ('83000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','Synthetic Responder','responder',true),
  ('83000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001','Synthetic Guardian','guardian',true),
  ('83000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000004','82000000-0000-4000-8000-000000000001','Synthetic Outsider','resident',true);
insert into qralalay.residents(id,barangay_id,full_name,created_by,public_disclosure_approved)
values ('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','Synthetic Resident','83000000-0000-4000-8000-000000000001',false);
insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status,verified_by,verified_at)
values ('82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000003','parent','verified','83000000-0000-4000-8000-000000000001',now());
insert into qralalay.qr_cards(id,barangay_id,resident_id,token_hash,issued_by)
values ('85000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001',repeat('a',64),'83000000-0000-4000-8000-000000000001');
insert into qralalay.assistance_cases(id,barangay_id,resident_id,status,public_note)
values ('86000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','new','Synthetic case');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select is((select profile_id from public.get_my_profile()),'83000000-0000-4000-8000-000000000001'::uuid,'Auth resolves the caller to their linked active profile');
select ok(set_config('qralalay.test_resident_id', public.create_resident_with_birth_date(
  'Synthetic DOB Resident',null,null,null,null,null,false,null,date '1990-04-03')::text,true) <> '',
  'an authorized official creates a resident with a private date-of-birth field');
select is((select date_of_birth from public.list_accessible_residents_with_photos()
  where resident_id=current_setting('qralalay.test_resident_id')::uuid),date '1990-04-03',
  'authorized resident listing returns the saved date of birth');
select is((select date_of_birth from public.list_accessible_residents_with_birth_date()
  where resident_id=current_setting('qralalay.test_resident_id')::uuid),date '1990-04-03',
  'previous resident-list RPC remains available with its established result shape');
select ok(public.update_profile_details_with_work_info(
  '83000000-0000-4000-8000-000000000001','Synthetic Official',null,'Barangay Clerk','Synthetic office address'),
  'an official can save their position and private contact address');
select is((select "position"||'|'||home_address from public.list_barangay_profiles_with_photos()
  where profile_id='83000000-0000-4000-8000-000000000001'),'Barangay Clerk|Synthetic office address',
  'the authorized account list returns the saved contact fields');
select is((select "position"||'|'||home_address from public.list_barangay_profiles_with_work_info()
  where profile_id='83000000-0000-4000-8000-000000000001'),'Barangay Clerk|Synthetic office address',
  'previous account-list RPC remains available with its established result shape');
select is((select "position"||'|'||home_address from public.get_my_profile_with_work_info()),
  'Barangay Clerk|Synthetic office address','previous own-profile RPC remains available with its established result shape');
select ok(set_config('qralalay.test_invited_profile_id',public.create_profile_invitation_with_work_info(
  'new-responder@example.test','Synthetic Invited Responder','+639171234567','responder','{}'::uuid[],null,'Responder','Synthetic responder address')::text,true) <> '',
  'an official can create an invitation with position and contact address');
select is((select "position"||'|'||home_address from public.list_barangay_profiles_with_photos()
  where profile_id=current_setting('qralalay.test_invited_profile_id')::uuid),'Responder|Synthetic responder address',
  'invited account contact fields appear in the scoped account list');
select is(public.set_profile_photo_path('83000000-0000-4000-8000-000000000001',
  'profiles/83000000-0000-4000-8000-000000000001/88000000-0000-4000-8000-000000000001.jpg'),null::text,
  'an official can save a photo path for their own profile');
select is((select photo_path from public.get_my_profile_with_photos()),
  'profiles/83000000-0000-4000-8000-000000000001/88000000-0000-4000-8000-000000000001.jpg',
  'the own-profile projection returns its private photo path');
select throws_ok($test$select public.set_profile_photo_path('83000000-0000-4000-8000-000000000001','profiles/invalid.jpg')$test$,
  '22023','Invalid photo path','profile photo setters reject malformed or cross-profile object paths');
select is(public.set_resident_photo_path('84000000-0000-4000-8000-000000000001',
  'residents/84000000-0000-4000-8000-000000000001/88000000-0000-4000-8000-000000000002.jpg'),null::text,
  'an in-scope official can save a resident photo path');
select ok(public.can_read_profile_photo('residents/84000000-0000-4000-8000-000000000001/88000000-0000-4000-8000-000000000002.jpg'),
  'an authorized official can read the resident photo object');
select throws_ok($test$select public.create_resident_with_birth_date(
  'Synthetic Future DOB',null,null,null,null,null,false,null,date '2999-12-31')$test$,
  '22023','Date of birth cannot be in the future','future resident birth dates are rejected');
select ok(set_config('qralalay.test_assignment_id',
  public.assign_responder('86000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002',1)::text,true) <> '',
  'an in-scope official can create one version-checked assignment');
select is(public.set_profile_photo_path('83000000-0000-4000-8000-000000000002',
  'profiles/83000000-0000-4000-8000-000000000002/88000000-0000-4000-8000-000000000003.jpg'),null::text,
  'an official can add a photo to the assigned responder account');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select throws_ok($test$select public.record_safety_observation('86000000-0000-4000-8000-000000000001','safe','in_person',null)$test$,
  '42501','Not authorized for this case','a pending responder cannot report an observation before accepting the assignment');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
select ok(not public.can_read_profile_photo('profiles/83000000-0000-4000-8000-000000000002/88000000-0000-4000-8000-000000000003.jpg'),
  'an unrelated profile cannot read a responder photo through case membership');
select throws_ok($test$select * from public.get_assistance_case('86000000-0000-4000-8000-000000000001')$test$,
  '42501','Not authorized for this case','an unrelated profile cannot read a case');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select ok(public.respond_to_assignment(current_setting('qralalay.test_assignment_id')::uuid,'accepted',null),
  'the assigned responder can accept the assignment');
select ok(public.record_safety_observation('86000000-0000-4000-8000-000000000001','safe','in_person','Synthetic observation') is not null,
  'the accepted responder can submit an independent safety observation');
select ok(public.submit_case_report('86000000-0000-4000-8000-000000000001','Synthetic actions','Stable','assisted_independently',null) is not null,
  'the accepted responder can submit a report with an explicit outcome');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select throws_ok($test$select public.close_assistance_case('86000000-0000-4000-8000-000000000001','Synthetic closure',3)$test$,
  '23514','Required independent safety confirmations and responder report are incomplete',
  'official closure is blocked while the registered guardian has not confirmed safety');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
select is((select photo_path from public.list_accessible_case_responder_photos()
  where profile_id='83000000-0000-4000-8000-000000000002'),
  'profiles/83000000-0000-4000-8000-000000000002/88000000-0000-4000-8000-000000000003.jpg',
  'a linked guardian can receive the assigned responder photo path for a visible case');
select ok(public.can_read_profile_photo('profiles/83000000-0000-4000-8000-000000000002/88000000-0000-4000-8000-000000000003.jpg'),
  'a linked guardian can read the assigned responder photo for their case');
select ok(public.record_safety_observation('86000000-0000-4000-8000-000000000001','safe','remote_communication','Synthetic guardian observation') is not null,
  'a linked guardian can submit a separate safety observation');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select ok(public.close_assistance_case('86000000-0000-4000-8000-000000000001','Synthetic official closure',3),
  'official closure succeeds only after the required responder report and independent safety observations');

reset role;
select is((select reviewed_by::text||'|'||(reviewed_at is not null)::text
  from qralalay.case_reports where case_id='86000000-0000-4000-8000-000000000001'),
  '83000000-0000-4000-8000-000000000001|true',
  'official closure records review on the responder report separately');
select is((select status from qralalay.case_assignments
  where case_id='86000000-0000-4000-8000-000000000001'),
  'completed','official closure separately completes the responder assignment');
set local role service_role;
select ok((public.get_public_qr_view(repeat('a',64))->>'active')::boolean
  and not (public.get_public_qr_view(repeat('a',64)) ? 'address')
  and not (public.get_public_qr_view(repeat('a',64)) ? 'full_name')
  and not (public.get_public_qr_view(repeat('a',64)) ? 'date_of_birth'),
  'public QR lookup returns the approved projection without address, legal full name, or date of birth');
select lives_ok($test$select * from public.create_public_assistance_request(
  repeat('a',64),'87000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64),null,null,null,null,null)$test$,
  'service gateway accepts a valid synthetic public request');
select lives_ok($test$select * from public.create_public_assistance_request(
  repeat('a',64),'87000000-0000-4000-8000-000000000001',repeat('b',64),repeat('c',64),repeat('d',64),null,null,null,null,null)$test$,
  'same idempotency key and payload return the existing request');
reset role;
select is((select count(*)::int from qralalay.case_request_credentials where idempotency_key='87000000-0000-4000-8000-000000000001'),1,
  'idempotent retry creates only one request credential row');
set local role service_role;
select lives_ok($test$select public.cancel_public_assistance_request(repeat('b',64))$test$,'a requester can withdraw their own capability');
reset role;
select is((select c.status from qralalay.assistance_cases c join qralalay.case_request_credentials r on r.case_id=c.id
  where r.idempotency_key='87000000-0000-4000-8000-000000000001'),'new',
  'request cancellation does not automatically close an assistance case');

reset role;
insert into qralalay.assistance_cases(id,barangay_id,resident_id,status)
values ('86000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','new');
insert into qralalay.case_assignments(barangay_id,case_id,responder_id,assigned_by)
values ('82000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001');
select throws_ok($test$insert into qralalay.case_assignments(barangay_id,case_id,responder_id,assigned_by)
  values ('82000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001')$test$,
  '23505',null,'the partial unique index rejects a second active assignment for one case');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select throws_ok($test$select public.revoke_qr_card('85000000-0000-4000-8000-000000000001','lost card')$test$,
  '42501','Active official profile required','a responder cannot revoke a resident QR card');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',true);
select ok(public.revoke_qr_card('85000000-0000-4000-8000-000000000001','lost card'),
  'an in-scope official can revoke a QR card with a reason');
reset role;
select is((select status from qralalay.qr_cards where id='85000000-0000-4000-8000-000000000001'),'revoked',
  'QR revocation changes the card status transactionally');
select is((select count(*)::int from qralalay.audit_logs
  where action='qr_card.revoked' and target_id='84000000-0000-4000-8000-000000000001' and result='lost card'),1,
  'QR revocation writes exactly one audit event');

select * from finish();
rollback;
