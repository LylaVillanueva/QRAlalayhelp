begin;
select plan(65);

select ok(not has_schema_privilege('anon','qralalay','USAGE'),'anon cannot use the private schema');
select ok(not has_schema_privilege('authenticated','qralalay','USAGE'),'authenticated cannot use the private schema directly');
select ok(has_schema_privilege('service_role','qralalay','USAGE'),'service_role has the private schema usage required by server functions');
select ok(exists (select 1 from pg_catalog.pg_attribute where attrelid='qralalay.residents'::regclass and attname='date_of_birth' and not attisdropped),'resident birth date is stored in the private profile schema');
select ok(has_function_privilege('authenticated','public.list_accessible_residents_with_photos()','EXECUTE'),'authorized resident viewers can read protected resident fields and photo paths');
select ok(not has_function_privilege('anon','public.list_accessible_residents_with_photos()','EXECUTE'),'anonymous clients cannot read resident fields or photo paths');
select ok(has_function_privilege('authenticated','public.list_accessible_residents_with_birth_date()','EXECUTE')
  and has_function_privilege('authenticated','public.list_barangay_profiles_with_work_info()','EXECUTE')
  and has_function_privilege('authenticated','public.get_my_profile_with_work_info()','EXECUTE')
  and not has_function_privilege('anon','public.list_accessible_residents_with_birth_date()','EXECUTE')
  and not has_function_privilege('anon','public.list_barangay_profiles_with_work_info()','EXECUTE')
  and not has_function_privilege('anon','public.get_my_profile_with_work_info()','EXECUTE'),'legacy RPC names keep their authenticated-only grants');
select ok((select count(*)=2 from pg_catalog.pg_attribute where attrelid='qralalay.profiles'::regclass and attname=any(array['position','home_address']) and not attisdropped),'profile work-position and contact-address fields exist');
select ok(has_function_privilege('authenticated','public.update_profile_details_with_work_info(uuid,text,text,text,text)','EXECUTE'),'authenticated officials can update scoped account contact fields');
select ok(has_function_privilege('authenticated','public.create_profile_invitation_with_work_info(text,text,text,text,uuid[],text,text,text)','EXECUTE'),'authorized officials can create invitations with scoped contact fields');
select ok(not has_function_privilege('anon','public.list_barangay_profiles_with_photos()','EXECUTE'),'anonymous clients cannot read account contact fields or photo paths');
select ok((select count(*)=1 from pg_catalog.pg_attribute where attrelid='qralalay.profiles'::regclass and attname='photo_path' and not attisdropped)
  and (select count(*)=1 from pg_catalog.pg_attribute where attrelid='qralalay.residents'::regclass and attname='photo_path' and not attisdropped),'profile and resident photo paths are stored privately');
select ok(exists(select 1 from storage.buckets where id='profile-photos' and not public and file_size_limit=716800
  and allowed_mime_types @> array['image/jpeg','image/png','image/webp']),'profile photo storage is private and restricted to supported image types');
select ok(has_function_privilege('authenticated','public.set_profile_photo_path(uuid,text)','EXECUTE')
  and has_function_privilege('authenticated','public.set_resident_photo_path(uuid,text)','EXECUTE'),'authenticated clients can use protected photo path setters');
select ok(not has_function_privilege('anon','public.set_profile_photo_path(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.set_resident_photo_path(uuid,text)','EXECUTE'),'anonymous clients cannot change profile or resident photo paths');
select is((select count(*)::int from pg_catalog.pg_policies where schemaname='storage' and tablename='objects'
  and policyname like 'qralalay_private_photo_%'),3,'private photo storage has scoped read, insert, and delete policies');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.can_read_profile_photo(text)'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.can_change_profile_photo(text)'::regprocedure)
  and (select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid='public.can_change_resident_photo(text)'::regprocedure),'photo storage authorization helpers are hardened SECURITY DEFINER functions');
select ok(not has_function_privilege('anon','public.can_read_profile_photo(text)','EXECUTE')
  and not has_function_privilege('anon','public.can_change_profile_photo(text)','EXECUTE')
  and not has_function_privilege('anon','public.can_change_resident_photo(text)','EXECUTE'),'anonymous clients cannot invoke photo authorization helpers');
select ok(not has_function_privilege('anon','public.get_my_profile_with_photos()','EXECUTE'),'anonymous clients cannot read own profile contact fields or photo paths');
select ok(has_function_privilege('authenticated','public.list_accessible_case_responder_photos()','EXECUTE')
  and not has_function_privilege('anon','public.list_accessible_case_responder_photos()','EXECUTE'),'only authenticated clients can list photos for their accessible case responders');
select ok(not has_schema_privilege('anon','qralalay','CREATE'),'anon cannot create private-schema objects');
select ok(not has_schema_privilege('authenticated','qralalay','CREATE'),'authenticated cannot create private-schema objects');
select ok(not exists (
  select 1 from information_schema.tables t
  where t.table_schema='qralalay'
    and (has_table_privilege('anon',format('%I.%I',t.table_schema,t.table_name),'SELECT')
      or has_table_privilege('authenticated',format('%I.%I',t.table_schema,t.table_name),'SELECT'))
),'client roles have no direct SELECT access to private tables');
select ok(not exists (
  select 1 from information_schema.tables t
  where t.table_schema='qralalay'
    and (has_table_privilege('anon',format('%I.%I',t.table_schema,t.table_name),'INSERT')
      or has_table_privilege('authenticated',format('%I.%I',t.table_schema,t.table_name),'INSERT')
      or has_table_privilege('anon',format('%I.%I',t.table_schema,t.table_name),'UPDATE')
      or has_table_privilege('authenticated',format('%I.%I',t.table_schema,t.table_name),'UPDATE')
      or has_table_privilege('anon',format('%I.%I',t.table_schema,t.table_name),'DELETE')
      or has_table_privilege('authenticated',format('%I.%I',t.table_schema,t.table_name),'DELETE'))
),'client roles cannot write directly to private tables');
select is((select count(*)::int from pg_catalog.pg_tables p join pg_catalog.pg_class c on c.relname=p.tablename join pg_catalog.pg_namespace n on n.oid=c.relnamespace and n.nspname=p.schemaname where p.schemaname='qralalay' and c.relrowsecurity),20,'RLS is enabled on all foundation and additive tables');
select ok(not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='qralalay' and c.relkind='r' and c.relforcerowsecurity),'RLS is not forced, consistent with the locked foundation baseline');
select ok(has_function_privilege('authenticated','public.get_my_profile()','EXECUTE'),'authenticated can execute its own-profile helper');
select ok(not has_function_privilege('anon','public.get_my_profile()','EXECUTE'),'anon cannot execute the profile helper');
select is((select r.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner where p.oid='public.get_my_profile()'::regprocedure),'postgres','profile helper owner is postgres');
select ok((select p.prosecdef from pg_catalog.pg_proc p where p.oid='public.get_my_profile()'::regprocedure),'profile helper is SECURITY DEFINER');
select ok((select p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid='public.get_my_profile()'::regprocedure),'profile helper pins an empty search_path');
select ok(not has_function_privilege('anon','public.get_public_qr_view(text)','EXECUTE'),'anon cannot bypass the public QR Edge Function');
select ok(not has_function_privilege('authenticated','public.get_public_qr_view(text)','EXECUTE'),'authenticated clients cannot invoke the server-only QR lookup');
select ok(has_function_privilege('service_role','public.get_public_qr_view(text)','EXECUTE'),'service_role can call the rate-limited public QR gateway');
select ok(not has_function_privilege('authenticated','public.create_public_assistance_request(text,uuid,text,text,text,text,double precision,double precision,double precision,text)','EXECUTE'),'authenticated users cannot impersonate a public requester');
select ok(has_function_privilege('service_role','public.create_public_assistance_request(text,uuid,text,text,text,text,double precision,double precision,double precision,text)','EXECUTE'),'Edge service role can submit public assistance requests');
select ok(has_function_privilege('authenticated','public.create_resident(text,text,text,text,text,text,boolean,text)','EXECUTE'),'authenticated users can call the protected resident API');
select ok(not has_function_privilege('anon','public.create_resident(text,text,text,text,text,text,boolean,text)','EXECUTE'),'anonymous users cannot call resident management');
select ok(not has_table_privilege('authenticated','qralalay.notification_outbox','SELECT'),'authenticated users cannot read the notification outbox');
select ok(not exists (select 1 from pg_catalog.pg_policies where schemaname='qralalay' and tablename='notification_outbox' and roles @> array['authenticated']::name[]),'the notification outbox has no authenticated row policy');
select ok((select relrowsecurity from pg_catalog.pg_class where oid='realtime.messages'::regclass),'Supabase-managed Realtime messages keeps RLS enabled');
select ok(exists (select 1 from pg_catalog.pg_policies where schemaname='realtime' and tablename='messages' and policyname='qralalay_profile_broadcast_read'),'Realtime subscriptions are limited to the signed-in profile topic');
select ok(not exists (
  select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=any(array[
    'create_resident','update_resident','archive_resident','create_guardian_link','review_guardian_link',
    'issue_qr_card','revoke_qr_card','acknowledge_assistance_case','assign_responder','reassign_responder',
    'respond_to_assignment','record_safety_observation','mark_guardian_unreachable','record_guardian_contact_attempt',
    'record_responder_unreachable','submit_case_report',
    'close_assistance_case','reopen_assistance_case','get_case_history','list_barangay_residents',
    'list_assistance_cases','get_assistance_case','list_resident_case_history','get_case_report',
    'register_my_device_token','unregister_my_device_token','list_my_notifications','mark_my_notification_read',
    'consume_public_request_quota','create_public_assistance_request','cancel_public_assistance_request',
    'start_public_location_share','update_public_location_share','stop_public_location_share',
    'claim_notification_batch','finish_notification_attempt','claim_notification_receipts','finish_notification_receipt',
    'cleanup_expired_location_shares','cleanup_public_request_buckets','create_profile_invitation','create_profile_invitation_with_work_info',
    'update_profile_details','update_profile_details_with_work_info','get_my_profile_with_photos','list_barangay_profiles_with_photos',
    'get_my_profile_with_work_info','list_barangay_profiles_with_work_info','list_accessible_residents_with_birth_date',
    'create_resident_with_birth_date','update_resident_with_birth_date','list_accessible_residents_with_photos','set_profile_photo_path','set_resident_photo_path',
    'can_read_profile_photo','can_change_profile_photo','can_change_resident_photo','list_accessible_case_responder_photos','set_profile_active',
    'change_profile_role','can_receive_profile_broadcast','get_case_shared_location',
    'create_profile_phone_invitation_with_work_info','claim_phone_invitation','phone_auth_user_exists'
  ]) and (not p.prosecdef or not coalesce(p.proconfig,'{}') @> array['search_path=""'])
),'all application API functions are SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('authenticated','public.create_profile_phone_invitation_with_work_info(text,text,text,uuid[],text,text,text)','EXECUTE'),'authenticated officials can create phone invitations through the protected RPC');
select ok(not has_function_privilege('anon','public.create_profile_phone_invitation_with_work_info(text,text,text,uuid[],text,text,text)','EXECUTE'),'anonymous users cannot create phone invitations');
select ok(has_function_privilege('authenticated','public.claim_phone_invitation()','EXECUTE'),'authenticated users can claim only their verified phone invitation');
select ok(not has_function_privilege('anon','public.claim_phone_invitation()','EXECUTE'),'anonymous users cannot claim phone invitations');
select ok(has_function_privilege('service_role','public.phone_auth_user_exists(text)','EXECUTE'),'only the Edge Function service role can check for an existing Auth phone');
select ok(not has_function_privilege('authenticated','public.phone_auth_user_exists(text)','EXECUTE'),'authenticated users cannot probe Auth phone registration');
select ok(not has_function_privilege('anon','public.close_assistance_case(uuid,text,integer)','EXECUTE'),'anonymous users cannot close cases');
select ok(not has_function_privilege('anon','public.reopen_assistance_case(uuid,text,integer)','EXECUTE'),'anonymous users cannot reopen cases');
select ok(not has_function_privilege('authenticated','public.claim_notification_batch(integer)','EXECUTE'),'authenticated users cannot claim notification jobs');
select ok(not has_function_privilege('anon','public.consume_public_request_quota(text,integer,integer)','EXECUTE'),'anonymous users cannot bypass Edge IP rate limits');
select ok(has_function_privilege('authenticated','public.respond_to_assignment(uuid,text,text)','EXECUTE'),'responders can accept or decline their own assignment through the protected function');
select ok(not has_function_privilege('anon','public.respond_to_assignment(uuid,text,text)','EXECUTE'),'anonymous users cannot accept assignments');
select ok(has_function_privilege('authenticated','public.record_guardian_contact_attempt(uuid,text)','EXECUTE'),'responders can document contact attempts without setting the official exception');
select ok(not has_function_privilege('anon','public.record_guardian_contact_attempt(uuid,text)','EXECUTE'),'anonymous users cannot create guardian-contact audit events');
select ok(has_function_privilege('authenticated','public.record_responder_unreachable(uuid,text)','EXECUTE'),'responders can document inability to reach a location');
select ok(not has_function_privilege('authenticated','public.cleanup_expired_location_shares(integer)','EXECUTE'),'clients cannot invoke internal location cleanup');
select ok(has_function_privilege('service_role','public.cleanup_expired_location_shares(integer)','EXECUTE'),'the internal worker can expire and erase temporary coordinates');
select ok(not has_function_privilege('authenticated','public.cleanup_public_request_buckets(integer)','EXECUTE'),'clients cannot clean rate-limit state');
select ok(has_function_privilege('service_role','public.cleanup_public_request_buckets(integer)','EXECUTE'),'the internal worker can prune stale rate-limit hashes');
select ok(has_function_privilege('authenticated','public.can_receive_profile_broadcast(text)','EXECUTE'),'Realtime policy calls a narrow public wrapper while qralalay remains private');
select ok(not has_function_privilege('anon','public.can_receive_profile_broadcast(text)','EXECUTE'),'anonymous clients cannot authorize private Realtime broadcasts');
select ok((select position('case_reports' in p.prosrc)>0 and position($test$'safe'$test$ in p.prosrc)>0 and position($test$'not_safe'$test$ in p.prosrc)>0
  from pg_catalog.pg_proc p where p.oid='public.close_assistance_case(uuid,text,integer)'::regprocedure),'case closure checks report and safety requirements in its transaction');

select * from finish();
rollback;
