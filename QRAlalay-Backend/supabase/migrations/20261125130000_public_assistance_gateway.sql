-- Safe public QR and assistance request gateway. Public clients only reach
-- these operations through Edge Functions using service_role; raw QR and
-- request credentials are never stored.
begin;

alter table qralalay.assistance_cases
  add column guardian_unreachable_at timestamptz,
  add column cancellable_until timestamptz;

create table qralalay.case_request_credentials (
  idempotency_key uuid primary key,
  case_id uuid not null references qralalay.assistance_cases(id),
  request_token_hash text not null unique check (request_token_hash ~ '^[0-9a-f]{64}$'),
  location_token_hash text not null unique check (location_token_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  cancellable_until timestamptz,
  cancelled_at timestamptz,
  joined_existing_case boolean not null default false,
  created_at timestamptz not null default now()
);

create table qralalay.case_location_shares (
  location_token_hash text primary key check (location_token_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key uuid not null unique references qralalay.case_request_credentials(idempotency_key),
  case_id uuid not null references qralalay.assistance_cases(id),
  started_at timestamptz,
  stopped_at timestamptz,
  expires_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  last_shared_at timestamptz,
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null)),
  check (latitude between -90 and 90 and longitude between -180 and 180 or latitude is null),
  check (accuracy_meters is null or (latitude is not null and accuracy_meters >= 0 and accuracy_meters < 'Infinity'::float8))
);

create table qralalay.public_request_buckets (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table qralalay.case_request_credentials enable row level security;
alter table qralalay.case_location_shares enable row level security;
alter table qralalay.public_request_buckets enable row level security;
revoke all on qralalay.case_request_credentials, qralalay.case_location_shares, qralalay.public_request_buckets
  from public, anon, authenticated, service_role;

create or replace function qralalay.enqueue_case_event_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case qralalay.assistance_cases%rowtype;
  v_recipient uuid;
begin
  select * into v_case from qralalay.assistance_cases c where c.id = new.case_id;
  if not found then return new; end if;

  insert into qralalay.notifications
    (barangay_id, recipient_id, case_id, event_id, event_type)
  select v_case.barangay_id, target.profile_id, new.case_id, new.id, new.event_type
  from (
    select p.id as profile_id
    from qralalay.profiles p
    where p.barangay_id = v_case.barangay_id and p.role = 'official' and p.is_active
    union
    select gl.guardian_id
    from qralalay.guardian_links gl
    join qralalay.profiles p on p.id = gl.guardian_id and p.is_active
    where gl.resident_id = v_case.resident_id and gl.status = 'verified'
    union
    select ca.responder_id
    from qralalay.case_assignments ca
    join qralalay.profiles p on p.id = ca.responder_id and p.is_active
    where ca.case_id = new.case_id and ca.status in ('pending_acceptance','accepted','completed')
  ) target
  where target.profile_id is distinct from new.actor_id
  on conflict (event_id, recipient_id) do nothing;

  insert into qralalay.notification_outbox (notification_id, device_token_id)
  select n.id, dt.id
  from qralalay.notifications n
  join qralalay.device_tokens dt on dt.user_id = n.recipient_id
    and dt.barangay_id = n.barangay_id and dt.is_active
  where n.event_id = new.id
  on conflict (notification_id, device_token_id) do nothing;
  -- Send a data-free invalidation only to the profiles selected for this
  -- event. Recipients must fetch case data through the authorized API.
  for v_recipient in
    select distinct n.recipient_id from qralalay.notifications n where n.event_id=new.id
  loop
    begin
      perform realtime.send(
        jsonb_build_object('eventId',new.id,'eventType',new.event_type,'caseId',new.case_id),
        'case_event', 'qralalay:profile:' || v_recipient::text, true
      );
    exception when others then
      raise warning 'qralalay realtime broadcast unavailable';
    end;
  end loop;
  return new;
end;
$function$;

revoke all on function qralalay.enqueue_case_event_notifications() from public, anon, authenticated;
create trigger case_event_enqueue_notifications
  after insert on qralalay.case_events
  for each row execute function qralalay.enqueue_case_event_notifications();

create or replace function public.consume_public_request_quota(
  p_bucket_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_window timestamptz;
  v_count integer;
begin
  if p_bucket_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate-limit parameters';
  end if;
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  insert into qralalay.public_request_buckets(bucket_hash, window_started_at, request_count)
  values (p_bucket_hash, v_window, 1)
  on conflict (bucket_hash) do update
    set window_started_at = excluded.window_started_at,
        request_count = case
          when qralalay.public_request_buckets.window_started_at = excluded.window_started_at
          then qralalay.public_request_buckets.request_count + 1
          else 1
        end,
        updated_at = now()
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$function$;

create or replace function public.get_public_qr_view(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('active', false);
  end if;
  select jsonb_build_object(
    'active', true,
    'barangayName', b.name,
    'displayName', case when r.public_disclosure_approved then r.display_name else null end,
    'assistanceInstructions', case when r.public_disclosure_approved then r.assistance_instructions else null end,
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object('label', bc.label, 'phone', bc.phone, 'availability', bc.availability)
                       order by bc.is_primary desc, bc.label)
      from qralalay.barangay_contacts bc
      where bc.barangay_id = b.id and bc.is_active and bc.verified_by is not null and bc.verified_at is not null
    ), '[]'::jsonb)
  ) into v_result
  from qralalay.qr_cards qc
  join qralalay.residents r on r.id = qc.resident_id and r.barangay_id = qc.barangay_id
  join qralalay.barangays b on b.id = qc.barangay_id
  where qc.token_hash = p_token_hash and qc.status = 'active'
    and r.registration_status = 'active' and b.is_active;
  return coalesce(v_result, jsonb_build_object('active', false));
end;
$function$;

create or replace function public.create_public_assistance_request(
  p_token_hash text,
  p_idempotency_key uuid,
  p_request_token_hash text,
  p_location_token_hash text,
  p_payload_hash text,
  p_public_note text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters double precision default null,
  p_location_description text default null
)
returns table(case_id uuid, case_status text, joined_existing boolean, cancellable_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing qralalay.case_request_credentials%rowtype;
  v_card qralalay.qr_cards%rowtype;
  v_resident qralalay.residents%rowtype;
  v_case qralalay.assistance_cases%rowtype;
  v_joined boolean := false;
  v_cancel_until timestamptz;
  v_previous_status text;
begin
  if p_token_hash is null or p_request_token_hash is null or p_location_token_hash is null or p_payload_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$' or p_request_token_hash !~ '^[0-9a-f]{64}$'
     or p_location_token_hash !~ '^[0-9a-f]{64}$'
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid request credential';
  end if;
  if p_idempotency_key is null or length(coalesce(p_public_note,'')) > 1000
     or length(coalesce(p_location_description,'')) > 500
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180))
     or (p_accuracy_meters is not null and (p_latitude is null or p_accuracy_meters < 0 or p_accuracy_meters >= 'Infinity'::float8)) then
    raise exception using errcode = '22023', message = 'Invalid assistance request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key::text, 0));
  select * into v_existing from qralalay.case_request_credentials c
    where c.idempotency_key = p_idempotency_key for update;
  if found then
    if v_existing.request_token_hash <> p_request_token_hash or v_existing.location_token_hash <> p_location_token_hash or v_existing.payload_hash <> p_payload_hash then
      raise exception using errcode = '22023', message = 'Idempotency key was used for another request';
    end if;
    return query select c.id, c.status, v_existing.joined_existing_case, v_existing.cancellable_until
      from qralalay.assistance_cases c where c.id = v_existing.case_id;
    return;
  end if;

  select * into v_card from qralalay.qr_cards qc
    where qc.token_hash = p_token_hash and qc.status = 'active';
  if not found then raise exception using errcode = 'P0002', message = 'QR code is not active'; end if;
  select * into v_resident from qralalay.residents r
    where r.id = v_card.resident_id and r.barangay_id = v_card.barangay_id
      and r.registration_status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'QR code is not active'; end if;

  select * into v_case from qralalay.assistance_cases c
    where c.resident_id = v_resident.id and c.status in ('new','in_progress','escalated')
    order by c.created_at desc limit 1 for update;
  if found then
    v_joined := true;
    v_previous_status := v_case.status;
    if v_case.status in ('new','in_progress') then
      update qralalay.assistance_cases set status = 'escalated', version = version + 1, updated_at = now()
        where id = v_case.id returning * into v_case;
    end if;
    v_cancel_until := v_case.cancellable_until;
    insert into qralalay.case_events
      (barangay_id, case_id, actor_id, event_type, previous_status, new_status, reason)
    values (v_case.barangay_id, v_case.id, null, 'repeat_public_request', v_previous_status, v_case.status,
            'A separate public QR request joined this open case.');
  else
    v_cancel_until := now() + interval '5 minutes';
    insert into qralalay.assistance_cases
      (barangay_id, resident_id, qr_card_id, status, public_note, latitude, longitude,
       accuracy_meters, location_description, location_captured_at, idempotency_key,
       request_token_hash, request_payload_hash, cancellable_until)
    values (v_resident.barangay_id, v_resident.id, v_card.id, 'new', nullif(trim(p_public_note),''),
       p_latitude, p_longitude, p_accuracy_meters, nullif(trim(p_location_description),''),
       case when p_latitude is not null then now() else null end, p_idempotency_key,
       p_request_token_hash, p_payload_hash, v_cancel_until)
    returning * into v_case;
    insert into qralalay.case_events
      (barangay_id, case_id, actor_id, event_type, previous_status, new_status, reason)
    values (v_case.barangay_id, v_case.id, null, 'public_assistance_requested', null, 'new', 'Public QR assistance request.');
  end if;

  insert into qralalay.case_request_credentials
    (idempotency_key, case_id, request_token_hash, location_token_hash, payload_hash, cancellable_until, joined_existing_case)
  values (p_idempotency_key, v_case.id, p_request_token_hash, p_location_token_hash, p_payload_hash, v_cancel_until, v_joined);
  insert into qralalay.case_location_shares(location_token_hash,idempotency_key,case_id,expires_at)
    values(p_location_token_hash,p_idempotency_key,v_case.id,now()+interval '30 minutes');
  insert into qralalay.audit_logs
    (barangay_id, actor_id, action, target_type, target_id, result, correlation_id)
  values (v_case.barangay_id, null, 'public_assistance.requested', 'assistance_case', v_case.id, 'success', p_idempotency_key);
  return query select v_case.id, v_case.status, v_joined, v_cancel_until;
end;
$function$;

create or replace function public.cancel_public_assistance_request(p_request_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request qralalay.case_request_credentials%rowtype;
  v_case qralalay.assistance_cases%rowtype;
  v_active_count integer;
begin
  if p_request_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid request credential';
  end if;
  select * into v_request from qralalay.case_request_credentials r
    where r.request_token_hash = p_request_token_hash for update;
  if not found then raise exception using errcode = 'P0002', message = 'Request not found'; end if;
  if v_request.cancelled_at is not null then return true; end if;
  if v_request.cancellable_until is null or now() > v_request.cancellable_until then
    raise exception using errcode = '42501', message = 'Cancellation window has expired';
  end if;
  select * into v_case from qralalay.assistance_cases c where c.id = v_request.case_id for update;
  update qralalay.case_request_credentials set cancelled_at = now()
    where idempotency_key = v_request.idempotency_key;
  update qralalay.case_location_shares set stopped_at=coalesce(stopped_at,now()),
    latitude=null,longitude=null,accuracy_meters=null,last_shared_at=null
    where idempotency_key=v_request.idempotency_key;
  select count(*) into v_active_count from qralalay.case_request_credentials r
    where r.case_id = v_case.id and r.cancelled_at is null;
  insert into qralalay.case_events
    (barangay_id, case_id, actor_id, event_type, previous_status, new_status, reason)
  values (v_case.barangay_id, v_case.id, null, 'public_requester_withdrew', v_case.status,
          v_case.status, case when v_active_count=0
            then 'All public requesters withdrew; case remains open for official safety review.'
            else 'One requester withdrew; the case remains active.' end);
  insert into qralalay.audit_logs
    (barangay_id, actor_id, action, target_type, target_id, result)
  values (v_case.barangay_id, null, 'public_assistance.requester_withdrew', 'assistance_case', v_case.id,
          case when v_active_count=0 then 'all_requesters_withdrew' else 'requester_withdrew' end);
  return true;
end;
$function$;

create or replace function public.get_public_assistance_status(p_request_token_hash text)
returns table(case_status text, case_created_at timestamptz, cancellable_until timestamptz, cancelled boolean)
language sql
security definer
set search_path = ''
as $function$
  select c.status, c.created_at, r.cancellable_until, r.cancelled_at is not null
  from qralalay.case_request_credentials r
  join qralalay.assistance_cases c on c.id = r.case_id
  where r.request_token_hash = p_request_token_hash
    and p_request_token_hash ~ '^[0-9a-f]{64}$';
$function$;

-- Remove expired live coordinates during the scheduled internal worker run.
-- Expiry is also enforced synchronously by every read/write operation.
create or replace function public.cleanup_expired_location_shares(p_limit integer default 500)
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare v_count integer;
begin
  if p_limit not between 1 and 2000 then raise exception using errcode='22023',message='Invalid cleanup batch size'; end if;
  with expired as (
    select s.location_token_hash from qralalay.case_location_shares s
    where s.expires_at<=now() and (s.latitude is not null or s.stopped_at is null)
    order by s.expires_at for update skip locked limit p_limit
  )
  update qralalay.case_location_shares s set latitude=null,longitude=null,accuracy_meters=null,
    stopped_at=coalesce(s.stopped_at,s.expires_at)
  from expired e where s.location_token_hash=e.location_token_hash;
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

create or replace function public.cleanup_public_request_buckets(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = ''
as $function$
declare v_count integer;
begin
  if p_limit not between 1 and 5000 then raise exception using errcode='22023',message='Invalid cleanup batch size'; end if;
  with expired as (
    select b.bucket_hash from qralalay.public_request_buckets b
    where b.updated_at<now()-interval '2 days' order by b.updated_at for update skip locked limit p_limit
  )
  delete from qralalay.public_request_buckets b using expired e where b.bucket_hash=e.bucket_hash;
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

create or replace function public.start_public_location_share(p_location_token_hash text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_share qralalay.case_location_shares%rowtype; v_case qralalay.assistance_cases%rowtype;
begin
  if p_location_token_hash is null or p_location_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Invalid location credential';
  end if;
  select * into v_share from qralalay.case_location_shares s where s.location_token_hash=p_location_token_hash for update;
  if not found or v_share.stopped_at is not null or v_share.expires_at<=now() then return false; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=v_share.case_id for update;
  if not found or v_case.status='closed' then
    update qralalay.case_location_shares set stopped_at=coalesce(stopped_at,now()),latitude=null,longitude=null,accuracy_meters=null
      where location_token_hash=p_location_token_hash;
    return false;
  end if;
  update qralalay.case_location_shares set started_at=coalesce(started_at,now()) where location_token_hash=p_location_token_hash;
  if v_share.started_at is null then
    insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
      values(v_case.barangay_id,v_case.id,null,'public_location_sharing_started',v_case.status,v_case.status,'Bystander explicitly started temporary location sharing.');
    insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
      values(v_case.barangay_id,null,'public_location.started','assistance_case',v_case.id,'success');
  end if;
  return true;
end;
$function$;

create or replace function public.update_public_location_share(p_location_token_hash text,p_latitude double precision,p_longitude double precision,p_accuracy_meters double precision default null)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_share qralalay.case_location_shares%rowtype; v_case_status text;
begin
  if p_location_token_hash is null or p_location_token_hash !~ '^[0-9a-f]{64}$'
     or p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or (p_accuracy_meters is not null and (p_accuracy_meters<0 or p_accuracy_meters>100000 or p_accuracy_meters>='Infinity'::float8)) then
    raise exception using errcode='22023',message='Invalid location update';
  end if;
  select * into v_share from qralalay.case_location_shares s where s.location_token_hash=p_location_token_hash for update;
  if not found or v_share.started_at is null or v_share.stopped_at is not null or v_share.expires_at<=now() then
    return false;
  end if;
  select c.status into v_case_status from qralalay.assistance_cases c where c.id=v_share.case_id for update;
  if v_case_status is null or v_case_status='closed' then
    update qralalay.case_location_shares set stopped_at=now(),latitude=null,longitude=null,accuracy_meters=null
      where location_token_hash=p_location_token_hash;
    return false;
  end if;
  update qralalay.case_location_shares set latitude=p_latitude,longitude=p_longitude,accuracy_meters=p_accuracy_meters,last_shared_at=now()
    where location_token_hash=p_location_token_hash;
  return true;
end;
$function$;

create or replace function public.stop_public_location_share(p_location_token_hash text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_share qralalay.case_location_shares%rowtype;
begin
  if p_location_token_hash is null or p_location_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='Invalid location credential';
  end if;
  select * into v_share from qralalay.case_location_shares s where s.location_token_hash=p_location_token_hash for update;
  if not found then return true; end if;
  update qralalay.case_location_shares set stopped_at=coalesce(stopped_at,now()),latitude=null,longitude=null,accuracy_meters=null
    where location_token_hash=p_location_token_hash;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    select c.barangay_id,c.id,null,'public_location_sharing_stopped',c.status,c.status,'Bystander stopped temporary location sharing.'
    from qralalay.assistance_cases c where c.id=v_share.case_id and v_share.started_at is not null and v_share.stopped_at is null;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    select c.barangay_id,null,'public_location.stopped','assistance_case',c.id,'success'
    from qralalay.assistance_cases c where c.id=v_share.case_id and v_share.started_at is not null and v_share.stopped_at is null;
  return true;
end;
$function$;

revoke all on function public.consume_public_request_quota(text,integer,integer) from public, anon, authenticated;
revoke all on function public.get_public_qr_view(text) from public, anon, authenticated;
revoke all on function public.create_public_assistance_request(text,uuid,text,text,text,text,double precision,double precision,double precision,text) from public, anon, authenticated;
revoke all on function public.cancel_public_assistance_request(text) from public, anon, authenticated;
revoke all on function public.get_public_assistance_status(text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_location_shares(integer) from public, anon, authenticated;
revoke all on function public.cleanup_public_request_buckets(integer) from public, anon, authenticated;
grant execute on function public.consume_public_request_quota(text,integer,integer) to service_role;
grant execute on function public.get_public_qr_view(text) to service_role;
grant execute on function public.create_public_assistance_request(text,uuid,text,text,text,text,double precision,double precision,double precision,text) to service_role;
grant execute on function public.cancel_public_assistance_request(text) to service_role;
grant execute on function public.get_public_assistance_status(text) to service_role;
grant execute on function public.cleanup_expired_location_shares(integer) to service_role;
grant execute on function public.cleanup_public_request_buckets(integer) to service_role;
revoke all on function public.start_public_location_share(text) from public,anon,authenticated;
revoke all on function public.update_public_location_share(text,double precision,double precision,double precision) from public,anon,authenticated;
revoke all on function public.stop_public_location_share(text) from public,anon,authenticated;
grant execute on function public.start_public_location_share(text) to service_role;
grant execute on function public.update_public_location_share(text,double precision,double precision,double precision) to service_role;
grant execute on function public.stop_public_location_share(text) to service_role;

commit;
