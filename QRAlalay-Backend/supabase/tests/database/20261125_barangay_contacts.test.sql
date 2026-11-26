begin;
select plan(19);

insert into auth.users(id,email) values
 ('81000000-0000-4000-8000-000000000021','contact-official@example.test'),
 ('81000000-0000-4000-8000-000000000022','contact-guardian@example.test'),
 ('81000000-0000-4000-8000-000000000023','contact-outside@example.test');
insert into qralalay.barangays(id,name,is_active) values
 ('82000000-0000-4000-8000-000000000021','Contact Test Barangay',true),
 ('82000000-0000-4000-8000-000000000022','Other Test Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active) values
 ('83000000-0000-4000-8000-000000000021','81000000-0000-4000-8000-000000000021','82000000-0000-4000-8000-000000000021','Contact Test Official','official',true),
 ('83000000-0000-4000-8000-000000000022','81000000-0000-4000-8000-000000000022','82000000-0000-4000-8000-000000000021','Contact Test Guardian','guardian',true),
 ('83000000-0000-4000-8000-000000000023','81000000-0000-4000-8000-000000000023','82000000-0000-4000-8000-000000000022','Other Contact Official','official',true);
insert into qralalay.residents(id,barangay_id,full_name,created_by)
values ('84000000-0000-4000-8000-000000000021','82000000-0000-4000-8000-000000000021','Contact Test Resident','83000000-0000-4000-8000-000000000021');
insert into qralalay.qr_cards(id,barangay_id,resident_id,token_hash,issued_by)
values ('85000000-0000-4000-8000-000000000021','82000000-0000-4000-8000-000000000021','84000000-0000-4000-8000-000000000021',repeat('e',64),'83000000-0000-4000-8000-000000000021');

select ok(has_function_privilege('authenticated','public.list_my_barangay_contacts()','EXECUTE')
 and has_function_privilege('authenticated','public.save_barangay_contact(uuid,text,text,text,boolean)','EXECUTE')
 and has_function_privilege('authenticated','public.verify_barangay_contact(uuid,boolean)','EXECUTE'),
 'authenticated callers can reach the scoped contact RPCs');
select ok(not has_function_privilege('anon','public.list_my_barangay_contacts()','EXECUTE')
 and not has_function_privilege('anon','public.save_barangay_contact(uuid,text,text,text,boolean)','EXECUTE')
 and not has_function_privilege('anon','public.verify_barangay_contact(uuid,boolean)','EXECUTE'),
 'anonymous callers cannot list or manage official contact numbers');

set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000021',true);
select ok(set_config('qralalay.test_contact_id',public.save_barangay_contact(null,'Barangay Hotline','+639171234567','24 hours',true)::text,true) <> '',
 'official can save a contact for their own barangay');
reset role;
select is((select is_active::text||'|'||coalesce(verified_at::text,'') from qralalay.barangay_contacts
 where id=current_setting('qralalay.test_contact_id')::uuid),'false|','saved number is inactive and unverified by default');
select is((select count(*)::int from qralalay.audit_logs where action='barangay_contact.created'
 and target_id=current_setting('qralalay.test_contact_id')::uuid and result='unverified'),1,
 'contact creation writes an audit record');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000021',true);
select is((select count(*)::int from public.list_my_barangay_contacts()),1,
 'official can see its unverified contact for management');
select throws_ok($test$select public.save_barangay_contact(null,'Bad Emergency','911',null,false)$test$,
 '22023','Enter a valid contact label, phone number, and availability',
 'national emergency number cannot be configured as the local hotline');
select throws_ok($test$select public.save_barangay_contact(null,'Bad Emergency','+911',null,false)$test$,
 '22023','Enter a valid contact label, phone number, and availability',
 'international-format national emergency number is also rejected');
select throws_ok($test$select public.save_barangay_contact('93000000-0000-4000-8000-000000000001','Other','+639171111111',null,false)$test$,
 '22023','Contact is not available to this official','official cannot edit another barangay contact');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000023',true);
select is((select count(*)::int from public.list_my_barangay_contacts()),0,
 'an official from a different barangay cannot list another barangay contact');
select throws_ok($test$select public.verify_barangay_contact(current_setting('qralalay.test_contact_id')::uuid,true)$test$,
 '22023','Contact is not available to this official','an official from a different barangay cannot verify another barangay contact');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000022',true);
select is((select count(*)::int from public.list_my_barangay_contacts()),0,
 'guardian cannot see unverified contact numbers');
select throws_ok($test$select public.verify_barangay_contact(current_setting('qralalay.test_contact_id')::uuid,true)$test$,
 '42501','Active barangay official required','guardian cannot activate a contact');

select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000021',true);
select ok(public.verify_barangay_contact(current_setting('qralalay.test_contact_id')::uuid,true),
 'official can confirm and activate its own contact');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000022',true);
select is((select phone from public.list_my_barangay_contacts()),'+639171234567',
 'guardian sees the active verified number');
reset role;
set local role service_role;
select is(public.get_public_qr_view(repeat('e',64))->'contacts'->0->>'phone','+639171234567',
 'public QR help projection returns the active verified contact');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000021',true);
select lives_ok($test$select public.save_barangay_contact(current_setting('qralalay.test_contact_id')::uuid,
 'Barangay Hotline','+639171234568','24 hours',true)$test$,
 'official can replace its contact number');
reset role;
select is((select count(*)::int from qralalay.barangay_contacts where id=current_setting('qralalay.test_contact_id')::uuid
 and not is_active and verified_by is null and verified_at is null),1,
 'changing the number clears its verification and removes it from public use');
set local role service_role;
select is(jsonb_array_length(public.get_public_qr_view(repeat('e',64))->'contacts'),0,
 'the QR public projection removes the old number immediately after it changes');
reset role;
select * from finish();
rollback;
