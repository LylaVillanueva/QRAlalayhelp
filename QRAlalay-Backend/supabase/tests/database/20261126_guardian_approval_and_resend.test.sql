begin;
select plan(34);

insert into auth.users(id,email,email_confirmed_at,invited_at,confirmation_sent_at) values
  ('a1200000-0000-4000-8000-000000000001','guardian-approval-official@example.test',now(),null,null),
  ('a1200000-0000-4000-8000-000000000002','guardian-approval-active@example.test',now(),null,null),
  ('a1200000-0000-4000-8000-000000000003','guardian-approval-pending@example.test',null,now(),now()),
  ('a1200000-0000-4000-8000-000000000004','guardian-approval-foreign@example.test',now(),null,null),
  ('a1200000-0000-4000-8000-000000000005','guardian-approval-inactive-official@example.test',now(),null,null);
insert into qralalay.barangays(id,name,is_active) values
  ('a2200000-0000-4000-8000-000000000001','Guardian Approval Barangay',true),
  ('a2200000-0000-4000-8000-000000000002','Other Barangay',true),
  ('a3200000-0000-4000-8000-000000000003','Other Pending Barangay',true);
insert into qralalay.profiles(id,auth_user_id,barangay_id,full_name,role,is_active) values
  ('a3200000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','Approval Official','official',true),
  ('a3200000-0000-4000-8000-000000000002','a1200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000001','Active Guardian','guardian',true),
  ('a3200000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000003','a2200000-0000-4000-8000-000000000001','Pending Guardian','guardian',false),
  ('a3200000-0000-4000-8000-000000000004','a1200000-0000-4000-8000-000000000004','a2200000-0000-4000-8000-000000000002','Foreign Official','official',true),
  ('a3200000-0000-4000-8000-000000000005','a1200000-0000-4000-8000-000000000005','a2200000-0000-4000-8000-000000000001','Inactive Official','official',false),
  ('a3200000-0000-4000-8000-000000000006',null,'a3200000-0000-4000-8000-000000000003','Foreign Pending Guardian','guardian',false);
insert into qralalay.residents(id,barangay_id,full_name,created_by,registration_status) values
  ('a4200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000001','Approval Resident','a3200000-0000-4000-8000-000000000001','active'),
  ('a4200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000001','Registration Resident','a3200000-0000-4000-8000-000000000001','active');
insert into qralalay.profile_invitation_emails(profile_id,email)
values ('a3200000-0000-4000-8000-000000000003','guardian-approval-pending@example.test'),
  ('a3200000-0000-4000-8000-000000000006','guardian-approval-foreign-pending@example.test');
insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status)
values ('a2200000-0000-4000-8000-000000000001','a4200000-0000-4000-8000-000000000002','a3200000-0000-4000-8000-000000000003','Parent','pending');
select set_config('qralalay.test_pending_link_id',(
  select id::text from qralalay.guardian_links
  where resident_id='a4200000-0000-4000-8000-000000000002'
    and guardian_id='a3200000-0000-4000-8000-000000000003' and status='pending'
),true);

select ok(has_function_privilege('authenticated','public.approve_guardian_relationship(uuid,uuid,text,text)','EXECUTE'),
  'authenticated callers can use the official-authorized relationship approval RPC');
select ok(not has_function_privilege('anon','public.approve_guardian_relationship(uuid,uuid,text,text)','EXECUTE'),
  'anonymous callers cannot approve guardian relationships');
select ok(has_function_privilege('authenticated','public.create_guardian_invitation_with_approved_links(text,text,text,uuid[],text,text,text)','EXECUTE'),
  'authenticated callers can use the official-authorized approved-invitation RPC');
select ok(not has_function_privilege('anon','public.create_guardian_invitation_with_approved_links(text,text,text,uuid[],text,text,text)','EXECUTE'),
  'anonymous callers cannot create approved guardian invitations');
select ok(has_function_privilege('authenticated','public.prepare_guardian_invitation_resend(uuid)','EXECUTE'),
  'authenticated callers can request a guardian resend through official authorization');
select ok(not has_function_privilege('anon','public.prepare_guardian_invitation_resend(uuid)','EXECUTE'),
  'anonymous callers cannot request guardian invitation resends');
select ok(has_function_privilege('service_role','public.complete_guardian_invitation_resend(uuid,uuid,uuid,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.complete_guardian_invitation_resend(uuid,uuid,uuid,text)','EXECUTE'),
  'only the server can record Auth resend outcomes');
select ok(exists(select 1 from pg_indexes where schemaname='qralalay' and indexname='one_current_guardian_link'),
  'the unique current-guardian relationship constraint remains in place');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select set_config('qralalay.test_new_link_id',public.approve_guardian_relationship(
  'a4200000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','Grandparent','linking')::text,true);
reset role;
select ok(current_setting('qralalay.test_new_link_id') is not null,'an official can approve an existing guardian while linking');
select is((select status||'|'||relationship||'|'||(verified_by='a3200000-0000-4000-8000-000000000001')::text||'|'||(verified_at is not null)::text
  from qralalay.guardian_links where id=current_setting('qralalay.test_new_link_id')::uuid),
  'verified|Grandparent|true|true','approval writes a verified link, approver, and timestamp');
select ok(exists(select 1 from qralalay.audit_logs where actor_id='a3200000-0000-4000-8000-000000000001'
  and action='guardian_link.approved' and target_id=current_setting('qralalay.test_new_link_id')::uuid and result='context=linking; relationship=Grandparent'),
  'approval is audited with the official, context, relationship, and target');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select is(public.approve_guardian_relationship('a4200000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','Grandparent','linking'),
  current_setting('qralalay.test_new_link_id')::uuid,'repeated approval is idempotent and returns the current link');
reset role;
select is((select count(*)::integer from qralalay.guardian_links where resident_id='a4200000-0000-4000-8000-000000000001' and guardian_id='a3200000-0000-4000-8000-000000000002' and status in ('pending','verified')),
  1,'repeated approval does not create a duplicate current relationship');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select is(public.approve_guardian_relationship('a4200000-0000-4000-8000-000000000002','a3200000-0000-4000-8000-000000000003','Child','pending_review'),
  current_setting('qralalay.test_pending_link_id')::uuid,
  'an authorized official can confirm a historical pending link in place');
reset role;
select is((select count(*)::integer from qralalay.guardian_links where resident_id='a4200000-0000-4000-8000-000000000002' and guardian_id='a3200000-0000-4000-8000-000000000003' and status in ('pending','verified')),
  1,'confirming a pending link preserves one relationship record');
select ok(exists(select 1 from qralalay.audit_logs where actor_id='a3200000-0000-4000-8000-000000000001'
  and action='guardian_link.approved' and result='context=pending_review; relationship=Child'),
  'historical pending-link approval is audited');

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000003',true);
select throws_ok($test$select public.approve_guardian_relationship('a4200000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','Parent','linking')$test$,
  '42501','Active official profile required','a guardian cannot approve a relationship');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000004',true);
select throws_ok($test$select public.approve_guardian_relationship('a4200000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','Parent','linking')$test$,
  'P0002','Active resident not found','a foreign-barangay official cannot link the resident');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000005',true);
select throws_ok($test$select public.approve_guardian_relationship('a4200000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','Parent','linking')$test$,
  '42501','Active official profile required','an inactive official cannot approve a relationship');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select throws_ok($test$select public.create_guardian_invitation_with_approved_links(
  'guardian-approval-foreign-pending@example.test','Duplicate Guardian',null,
  array['a4200000-0000-4000-8000-000000000001'::uuid],'Parent',null,null)$test$,
  '42501','Guardian invitation is not available','guardian invitations cannot reuse a profile from another barangay');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select set_config('qralalay.test_invited_profile_id',public.create_guardian_invitation_with_approved_links(
  'guardian-approval-new@example.test','New Test Guardian',null,
  array['a4200000-0000-4000-8000-000000000002'::uuid],'Parent',null,null)::text,true);
reset role;
select is((select role||'|'||is_active::text||'|'||(auth_user_id is null)::text
  from qralalay.profiles where id=current_setting('qralalay.test_invited_profile_id')::uuid),
  'guardian|false|true','approved invitation creates an inactive profile without bypassing Auth');
select is((select status||'|'||relationship||'|'||(verified_by='a3200000-0000-4000-8000-000000000001')::text||'|'||(verified_at is not null)::text
  from qralalay.guardian_links where guardian_id=current_setting('qralalay.test_invited_profile_id')::uuid and resident_id='a4200000-0000-4000-8000-000000000002'),
  'verified|Parent|true|true','new invitation stores explicit relationship approval during registration');
select ok(exists(select 1 from qralalay.audit_logs where actor_id='a3200000-0000-4000-8000-000000000001'
  and action='guardian_link.approved_during_registration' and result='relationship=Parent'),
  'registration-time approval is auditable');

insert into auth.users(id,email,invited_at,confirmation_sent_at)
values ('a1200000-0000-4000-8000-000000000006','guardian-approval-new@example.test',now(),now());
set local role service_role;
select public.link_invited_auth_user(current_setting('qralalay.test_invited_profile_id')::uuid,
  'a1200000-0000-4000-8000-000000000006','guardian-approval-new@example.test');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000006',true);
select is((select count(*)::integer from public.get_my_profile()),0,'unconfirmed invited guardian cannot sign in to an inactive profile');
select throws_ok($test$select * from public.list_accessible_residents_with_birth_date()$test$,
  '42501','Active profile required','unconfirmed guardian cannot access linked resident data');
select throws_ok($test$select public.set_profile_active(current_setting('qralalay.test_invited_profile_id')::uuid,true,'test activation')$test$,
  '42501','Active official profile required','guardian cannot activate their own account');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select throws_ok($test$select public.set_profile_active(current_setting('qralalay.test_invited_profile_id')::uuid,true,'test activation')$test$,
  '23514','The invited user must verify their email or phone before activation','official cannot activate before email confirmation');
reset role;
update auth.users set email_confirmed_at=now() where id='a1200000-0000-4000-8000-000000000006';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select is(public.set_profile_active(current_setting('qralalay.test_invited_profile_id')::uuid,true,'email verified by test guardian'),
  'a1200000-0000-4000-8000-000000000006'::uuid,'official can activate after email confirmation');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000006',true);
select is((select count(*)::integer from public.list_accessible_residents_with_birth_date()
  where resident_id='a4200000-0000-4000-8000-000000000002'),1,
  'guardian gains linked resident access only after confirmation and activation');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select set_config('qralalay.test_resend_id',request_id::text,true)
from public.prepare_guardian_invitation_resend('a3200000-0000-4000-8000-000000000003');
reset role;
select ok(current_setting('qralalay.test_resend_id') is not null,'official can request one resend for an existing unconfirmed inactive guardian');
select ok(exists(select 1 from qralalay.audit_logs where id=current_setting('qralalay.test_resend_id')::uuid
  and actor_id='a3200000-0000-4000-8000-000000000001' and action='guardian_invitation.resend_requested'),
  'resend request records the official and target profile');
set local role service_role;
select public.complete_guardian_invitation_resend(current_setting('qralalay.test_resend_id')::uuid,
  'a3200000-0000-4000-8000-000000000003','a1200000-0000-4000-8000-000000000003','auth_accepted');
reset role;
select ok(exists(select 1 from qralalay.audit_logs where actor_id='a3200000-0000-4000-8000-000000000001'
  and action='guardian_invitation.resend_accepted' and correlation_id=current_setting('qralalay.test_resend_id')::uuid),
  'server records Auth acceptance without exposing the email');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000001',true);
select throws_ok($test$select * from public.prepare_guardian_invitation_resend('a3200000-0000-4000-8000-000000000003')$test$,
  '22023','Please wait before requesting another invitation','resend attempts are rate-limited');
select set_config('request.jwt.claim.sub','a1200000-0000-4000-8000-000000000004',true);
select throws_ok($test$select * from public.prepare_guardian_invitation_resend('a3200000-0000-4000-8000-000000000003')$test$,
  'P0002','Eligible pending guardian invitation not found','a foreign-barangay official cannot resend an invitation');
select * from finish();
rollback;
