-- Approve guardian relationships at the official's registration/link action,
-- while keeping guardian account activation and email confirmation separate.
begin;

create function public.approve_guardian_relationship(
  p_resident_id uuid,
  p_guardian_profile_id uuid,
  p_relationship text,
  p_context text
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor record;
  v_link_id uuid;
  v_link_status text;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501',message='Active official profile required';
  end if;
  if length(trim(coalesce(p_relationship,''))) not between 1 and 100
    or p_context is null or p_context not in ('registration','linking','pending_review') then
    raise exception using errcode='22023',message='Invalid guardian relationship approval';
  end if;

  -- Serialize changes to the same resident, then preserve the unique current
  -- relationship constraint for concurrent link attempts.
  perform 1 from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id
      and r.registration_status='active' for update;
  if not found then
    raise exception using errcode='P0002',message='Active resident not found';
  end if;
  perform 1 from qralalay.profiles p
    where p.id=p_guardian_profile_id and p.barangay_id=v_actor.barangay_id
      and p.role='guardian' and p.auth_user_id is not null;
  if not found then
    raise exception using errcode='P0002',message='Eligible guardian not found';
  end if;

  select gl.id,gl.status into v_link_id,v_link_status
    from qralalay.guardian_links gl
    where gl.resident_id=p_resident_id and gl.guardian_id=p_guardian_profile_id
      and gl.status in ('pending','verified')
    for update;

  if found and v_link_status='verified' then
    return v_link_id;
  elsif found then
    update qralalay.guardian_links set relationship=trim(p_relationship),status='verified',
      verified_by=v_actor.profile_id,verified_at=now(),revoked_at=null
      where id=v_link_id;
  else
    insert into qralalay.guardian_links(
      barangay_id,resident_id,guardian_id,relationship,status,verified_by,verified_at
    ) values (
      v_actor.barangay_id,p_resident_id,p_guardian_profile_id,trim(p_relationship),
      'verified',v_actor.profile_id,now()
    ) returning id into v_link_id;
  end if;

  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'guardian_link.approved','guardian_link',v_link_id,
      'context='||p_context||'; relationship='||trim(p_relationship));
  return v_link_id;
end;
$function$;

-- New guardian invitation and relationship approval are one database
-- transaction. The profile remains inactive and has no Auth user until the
-- invitation flow completes; access is still gated by current_profile().
create function public.create_guardian_invitation_with_approved_links(
  p_email text,
  p_full_name text,
  p_phone text,
  p_resident_ids uuid[],
  p_relationship text,
  p_position text,
  p_home_address text
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor record;
  v_profile_id uuid;
  v_resident_id uuid;
  v_link_id uuid;
  v_link_status text;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501',message='Active official profile required';
  end if;
  if coalesce(cardinality(p_resident_ids),0) not between 1 and 25
    or length(trim(coalesce(p_relationship,''))) not between 1 and 100 then
    raise exception using errcode='22023',message='Guardian relationship approval is required';
  end if;
  if exists(
    select 1 from qralalay.profile_invitation_emails ie
    join qralalay.profiles p on p.id=ie.profile_id
    where lower(ie.email)=lower(trim(coalesce(p_email,'')))
      and p.barangay_id<>v_actor.barangay_id
  ) or exists(
    select 1 from auth.users u
    join qralalay.profiles p on p.auth_user_id=u.id
    where lower(u.email)=lower(trim(coalesce(p_email,'')))
      and p.barangay_id<>v_actor.barangay_id
  ) then
    raise exception using errcode='42501',message='Guardian invitation is not available';
  end if;
  if exists(
    select 1 from qralalay.profile_invitation_emails ie
    join qralalay.profiles p on p.id=ie.profile_id
    where lower(ie.email)=lower(trim(coalesce(p_email,''))) and p.role<>'guardian'
  ) then
    raise exception using errcode='23505',message='This email is already assigned to another QRAlalay account role';
  end if;

  v_profile_id := public.create_profile_invitation_with_work_info(
    p_email,p_full_name,p_phone,'guardian','{}'::uuid[],null,p_position,p_home_address
  );

  for v_resident_id in
    select distinct resident_id from unnest(p_resident_ids) as ids(resident_id)
  loop
    perform 1 from qralalay.residents r
      where r.id=v_resident_id and r.barangay_id=v_actor.barangay_id
        and r.registration_status='active' for update;
    if not found then
      raise exception using errcode='22023',message='Guardian relationship includes an unavailable resident';
    end if;

    select gl.id,gl.status into v_link_id,v_link_status
      from qralalay.guardian_links gl
      where gl.resident_id=v_resident_id and gl.guardian_id=v_profile_id
        and gl.status in ('pending','verified')
      for update;
    if found and v_link_status='verified' then
      continue;
    elsif found then
      update qralalay.guardian_links set relationship=trim(p_relationship),status='verified',
        verified_by=v_actor.profile_id,verified_at=now(),revoked_at=null
        where id=v_link_id;
    else
      insert into qralalay.guardian_links(
        barangay_id,resident_id,guardian_id,relationship,status,verified_by,verified_at
      ) values (
        v_actor.barangay_id,v_resident_id,v_profile_id,trim(p_relationship),
        'verified',v_actor.profile_id,now()
      ) returning id into v_link_id;
    end if;
    insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
      values(v_actor.barangay_id,v_actor.profile_id,'guardian_link.approved_during_registration',
        'guardian_link',v_link_id,'relationship='||trim(p_relationship));
  end loop;
  return v_profile_id;
end;
$function$;

-- Only an active same-barangay official can request a resend, and only for an
-- existing inactive guardian whose linked Auth invitation is still unconfirmed.
create function public.prepare_guardian_invitation_resend(p_profile_id uuid)
returns table(request_id uuid,email text,auth_user_id uuid)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor record;
  v_email text;
  v_auth_user_id uuid;
  v_request_id uuid;
  v_attempts integer;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501',message='Active official profile required';
  end if;

  select ie.email,u.id into v_email,v_auth_user_id
    from qralalay.profiles p
    join qralalay.profile_invitation_emails ie on ie.profile_id=p.id
    join auth.users u on u.id=p.auth_user_id and lower(u.email)=lower(ie.email)
    where p.id=p_profile_id and p.barangay_id=v_actor.barangay_id and p.role='guardian'
      and p.auth_user_id is not null and not p.is_active
      and u.invited_at is not null and u.email_confirmed_at is null
      and exists(select 1 from qralalay.guardian_links gl where gl.guardian_id=p.id and gl.status in ('pending','verified'))
    for update of p;
  if not found then
    raise exception using errcode='P0002',message='Eligible pending guardian invitation not found';
  end if;

  if exists(
    select 1 from qralalay.audit_logs a where a.target_type='profile' and a.target_id=p_profile_id
      and a.action='guardian_invitation.resend_requested'
      and a.created_at > now()-interval '5 minutes'
  ) then
    raise exception using errcode='22023',message='Please wait before requesting another invitation';
  end if;
  select count(*)::integer into v_attempts from qralalay.audit_logs a
    where a.target_type='profile' and a.target_id=p_profile_id
      and a.action='guardian_invitation.resend_requested'
      and a.created_at > now()-interval '24 hours';
  if v_attempts >= 3 then
    raise exception using errcode='22023',message='Invitation resend limit reached';
  end if;

  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'guardian_invitation.resend_requested',
      'profile',p_profile_id,'requested') returning id into v_request_id;
  return query select v_request_id,v_email,v_auth_user_id;
end;
$function$;

-- Edge Function only: records whether Auth accepted the resend request without
-- exposing the provider response or allowing clients to forge delivery logs.
create function public.complete_guardian_invitation_resend(
  p_request_id uuid,p_profile_id uuid,p_auth_user_id uuid,p_result text
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_request qralalay.audit_logs%rowtype;
begin
  if p_result is null or p_result not in ('auth_accepted','auth_rejected') then
    raise exception using errcode='22023',message='Invalid invitation resend result';
  end if;
  select * into v_request from qralalay.audit_logs a
    where a.id=p_request_id and a.action='guardian_invitation.resend_requested'
      and a.target_type='profile' and a.target_id=p_profile_id for update;
  if not found then raise exception using errcode='P0002',message='Invitation resend request not found'; end if;
  if not exists(select 1 from qralalay.profiles p where p.id=p_profile_id and p.auth_user_id=p_auth_user_id) then
    raise exception using errcode='23514',message='Invitation account changed during resend';
  end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result,correlation_id)
    values(v_request.barangay_id,v_request.actor_id,
      case when p_result='auth_accepted' then 'guardian_invitation.resend_accepted' else 'guardian_invitation.resend_failed' end,
      'profile',p_profile_id,p_result,p_request_id);
  return true;
end;
$function$;

create index audit_guardian_invitation_resends on qralalay.audit_logs(target_id,created_at desc)
  where action='guardian_invitation.resend_requested';

revoke all on function public.approve_guardian_relationship(uuid,uuid,text,text) from public,anon;
revoke all on function public.create_guardian_invitation_with_approved_links(text,text,text,uuid[],text,text,text) from public,anon;
revoke all on function public.prepare_guardian_invitation_resend(uuid) from public,anon;
revoke all on function public.complete_guardian_invitation_resend(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_guardian_relationship(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_guardian_invitation_with_approved_links(text,text,text,uuid[],text,text,text) to authenticated;
grant execute on function public.prepare_guardian_invitation_resend(uuid) to authenticated;
grant execute on function public.complete_guardian_invitation_resend(uuid,uuid,uuid,text) to service_role;

commit;
