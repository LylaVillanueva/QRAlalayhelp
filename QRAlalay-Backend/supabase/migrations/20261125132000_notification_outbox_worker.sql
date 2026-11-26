-- Lease-based, at-least-once Expo delivery. Notification text is generic;
-- case details are fetched only after the recipient authenticates.
begin;

create or replace function public.claim_notification_batch(p_limit integer default 50)
returns table(outbox_id uuid,lease_token uuid,expo_token text,event_id uuid,event_type text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='Invalid batch size'; end if;
  update qralalay.notification_outbox o set status='cancelled',last_error_code='inactive_device_token',
    lease_token=null,lease_until=null,updated_at=now()
  where (o.status='pending' or (o.status='processing' and o.lease_until<now() and o.provider_ticket_id is null))
    and not exists(select 1 from qralalay.device_tokens dt where dt.id=o.device_token_id and dt.is_active);
  return query
  with picked as (
    select o.id from qralalay.notification_outbox o
    where ((o.status='pending' and o.next_attempt_at<=now())
       or (o.status='processing' and o.lease_until<now() and o.provider_ticket_id is null))
      and exists (select 1 from qralalay.device_tokens dt where dt.id=o.device_token_id and dt.is_active)
    order by o.next_attempt_at,o.created_at
    for update skip locked limit p_limit
  ), claimed as (
    update qralalay.notification_outbox o set status='processing',attempts=o.attempts+1,
      lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()
    from picked p where o.id=p.id
    returning o.id,o.lease_token,o.notification_id
  )
  select c.id,c.lease_token,dt.expo_token,n.event_id,n.event_type
  from claimed c
  join qralalay.notifications n on n.id=c.notification_id
  join qralalay.device_tokens dt on dt.id=(select o.device_token_id from qralalay.notification_outbox o where o.id=c.id)
    and dt.is_active;
end;
$function$;

create or replace function public.finish_notification_attempt(
  p_outbox_id uuid,p_lease_token uuid,p_provider_ticket_id text,p_error_code text default null,p_permanent_failure boolean default false
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_attempts integer;
begin
  select o.attempts into v_attempts from qralalay.notification_outbox o
    where o.id=p_outbox_id and o.status='processing' and o.lease_token=p_lease_token for update;
  if not found then return false; end if;
  if p_provider_ticket_id is not null and length(p_provider_ticket_id)>200 then
    raise exception using errcode='22023',message='Invalid provider ticket';
  end if;
  if p_provider_ticket_id is not null then
    update qralalay.notification_outbox set status='awaiting_receipt',provider_ticket_id=p_provider_ticket_id,
      last_error_code=null,next_attempt_at=now()+interval '30 seconds',lease_token=null,lease_until=null,updated_at=now()
      where id=p_outbox_id;
  else
    if p_error_code='DeviceNotRegistered' then
      update qralalay.device_tokens dt set is_active=false,updated_at=now()
      where dt.id=(select o.device_token_id from qralalay.notification_outbox o where o.id=p_outbox_id);
    end if;
    update qralalay.notification_outbox set status=case when p_permanent_failure or v_attempts>=5 then 'failed' else 'pending' end,
      provider_ticket_id=null,last_error_code=left(coalesce(p_error_code,'provider_error'),80),
      next_attempt_at=now()+make_interval(secs=>least(3600,power(2,least(v_attempts,10))::integer*15)),
      lease_token=null,lease_until=null,updated_at=now()
      where id=p_outbox_id;
  end if;
  return true;
end;
$function$;

create or replace function public.claim_notification_receipts(p_limit integer default 100)
returns table(outbox_id uuid,lease_token uuid,provider_ticket_id text)
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='Invalid batch size'; end if;
  return query
  with picked as (
    select o.id from qralalay.notification_outbox o
    where (o.status='awaiting_receipt' and o.next_attempt_at<=now())
       or (o.status='processing' and o.lease_until<now() and o.provider_ticket_id is not null)
    order by o.next_attempt_at,o.created_at
    for update skip locked limit p_limit
  )
  update qralalay.notification_outbox o set status='processing',lease_token=gen_random_uuid(),
    lease_until=now()+interval '2 minutes',updated_at=now()
  from picked p where o.id=p.id
  returning o.id,o.lease_token,o.provider_ticket_id;
end;
$function$;

create or replace function public.finish_notification_receipt(
  p_outbox_id uuid,p_lease_token uuid,p_receipt_status text,p_error_code text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_row qralalay.notification_outbox%rowtype;
begin
  select * into v_row from qralalay.notification_outbox o
    where o.id=p_outbox_id and o.status='processing' and o.lease_token=p_lease_token for update;
  if not found then return false; end if;
  if p_receipt_status='ok' then
    update qralalay.notification_outbox set status='provider_accepted',last_error_code=null,
      lease_token=null,lease_until=null,updated_at=now() where id=p_outbox_id;
  elsif p_receipt_status='pending' then
    update qralalay.notification_outbox set status='awaiting_receipt',next_attempt_at=now()+interval '60 seconds',
      lease_token=null,lease_until=null,updated_at=now() where id=p_outbox_id;
  elsif p_receipt_status='error' then
    if p_error_code='DeviceNotRegistered' then
      update qralalay.device_tokens dt set is_active=false,updated_at=now()
      where dt.id=(select o.device_token_id from qralalay.notification_outbox o where o.id=p_outbox_id);
    end if;
    update qralalay.notification_outbox set status=case when v_row.attempts>=5 then 'failed' else 'pending' end,
      provider_ticket_id=null,last_error_code=left(coalesce(p_error_code,'receipt_error'),80),
      next_attempt_at=now()+make_interval(secs=>least(3600,power(2,least(v_row.attempts,10))::integer*15)),
      lease_token=null,lease_until=null,updated_at=now() where id=p_outbox_id;
  else
    raise exception using errcode='22023',message='Invalid receipt result';
  end if;
  return true;
end;
$function$;

revoke all on function public.claim_notification_batch(integer) from public,anon,authenticated;
revoke all on function public.finish_notification_attempt(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.claim_notification_receipts(integer) from public,anon,authenticated;
revoke all on function public.finish_notification_receipt(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_notification_batch(integer) to service_role;
grant execute on function public.finish_notification_attempt(uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.claim_notification_receipts(integer) to service_role;
grant execute on function public.finish_notification_receipt(uuid,uuid,text,text) to service_role;

commit;
