-- Phone-only profiles are linked to Auth only after the invited number is
-- verified through Supabase's OTP flow. The profile stays inactive until an
-- official activates it.
begin;

create table qralalay.profile_invitation_phones (
  profile_id uuid primary key references qralalay.profiles(id) on delete cascade,
  phone text not null unique,
  created_at timestamptz not null default now()
);
alter table qralalay.profile_invitation_phones enable row level security;
revoke all on qralalay.profile_invitation_phones from public,anon,authenticated,service_role;

create or replace function public.create_profile_phone_invitation_with_work_info(
  p_phone text,p_full_name text,p_role text,p_ward_ids uuid[],
  p_relationship text,p_position text,p_home_address text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor record;
  v_profile_id uuid;
  v_phone text;
  v_resident_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501',message='Active official profile required';
  end if;
  v_phone := trim(coalesce(p_phone,''));
  if v_phone !~ '^\+[1-9][0-9]{7,14}$'
    or length(trim(coalesce(p_full_name,''))) not between 1 and 200
    or p_role is null or p_role not in ('official','guardian','responder','resident')
    or coalesce(cardinality(p_ward_ids),0) > 25
    or (coalesce(cardinality(p_ward_ids),0) > 0 and
      (p_role <> 'guardian' or length(trim(coalesce(p_relationship,''))) not between 1 and 100))
    or length(coalesce(p_position,'')) > 100
    or length(coalesce(p_home_address,'')) > 300 then
    raise exception using errcode='22023',message='Invalid phone account invitation';
  end if;

  select p.id into v_profile_id
    from qralalay.profile_invitation_phones i
    join qralalay.profiles p on p.id=i.profile_id
    where i.phone=v_phone and p.barangay_id=v_actor.barangay_id
      and p.auth_user_id is null and not p.is_active
    for update of p;
  if found then
    update qralalay.profiles set full_name=trim(p_full_name),phone=v_phone,role=p_role,
      position=nullif(trim(p_position),''),home_address=nullif(trim(p_home_address),''),updated_at=now()
      where id=v_profile_id;
  else
    if exists(select 1 from qralalay.profiles p where regexp_replace(p.phone,'^\+','')=regexp_replace(v_phone,'^\+',''))
      or exists(select 1 from auth.users u join qralalay.profiles p on p.auth_user_id=u.id
        where regexp_replace(u.phone,'^\+','')=regexp_replace(v_phone,'^\+','')) then
      raise exception using errcode='23505',message='This phone number already belongs to a QRAlalay profile';
    end if;
    insert into qralalay.profiles(barangay_id,full_name,phone,role,is_active,"position",home_address)
      values(v_actor.barangay_id,trim(p_full_name),v_phone,p_role,false,
        nullif(trim(p_position),''),nullif(trim(p_home_address),'')) returning id into v_profile_id;
    insert into qralalay.profile_invitation_phones(profile_id,phone) values(v_profile_id,v_phone);
  end if;

  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'profile.phone_invitation_requested','profile',v_profile_id,'pending');

  if coalesce(cardinality(p_ward_ids),0)>0 then
    foreach v_resident_id in array p_ward_ids loop
      if not exists(select 1 from qralalay.residents r where r.id=v_resident_id
        and r.barangay_id=v_actor.barangay_id and r.registration_status='active') then
        raise exception using errcode='22023',message='Guardian relationship includes an unavailable resident';
      end if;
      insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status)
        values(v_actor.barangay_id,v_resident_id,v_profile_id,trim(p_relationship),'pending')
        on conflict (resident_id,guardian_id) where status in ('pending','verified')
        do update set relationship=excluded.relationship
        where qralalay.guardian_links.status='pending';
      insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
        select v_actor.barangay_id,v_actor.profile_id,'guardian_link.invited','guardian_link',gl.id,'pending'
        from qralalay.guardian_links gl where gl.resident_id=v_resident_id and gl.guardian_id=v_profile_id;
    end loop;
  end if;
  return v_profile_id;
end;
$function$;

create or replace function public.phone_auth_user_exists(p_phone text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select exists(select 1 from auth.users u
    where regexp_replace(u.phone,'^\+','')=regexp_replace(trim(coalesce(p_phone,'')),'^\+',''))
$function$;

create or replace function public.claim_phone_invitation()
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare
  v_user auth.users%rowtype;
  v_profile qralalay.profiles%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_user from auth.users u where u.id=auth.uid();
  if not found or v_user.phone_confirmed_at is null or v_user.phone is null then
    raise exception using errcode='42501',message='A verified phone number is required';
  end if;
  select * into v_profile from qralalay.profiles p where p.auth_user_id=auth.uid();
  if found then return true; end if;
  if exists(select 1 from qralalay.profiles p where p.auth_user_id=auth.uid()) then
    raise exception using errcode='23514',message='This Auth account is already linked to another profile';
  end if;
  select p.* into v_profile
    from qralalay.profile_invitation_phones i
    join qralalay.profiles p on p.id=i.profile_id
    where regexp_replace(i.phone,'^\+','')=regexp_replace(v_user.phone,'^\+','')
      and p.auth_user_id is null and not p.is_active
    for update of p;
  if not found then raise exception using errcode='P0002',message='No pending phone invitation was found'; end if;
  update qralalay.profiles set auth_user_id=auth.uid(),updated_at=now() where id=v_profile.id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_profile.barangay_id,null,'profile.phone_auth_verified','profile',v_profile.id,'success');
  return true;
end;
$function$;

create or replace function public.set_profile_active(p_profile_id uuid,p_active boolean,p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_target qralalay.profiles%rowtype; v_other_official_exists boolean;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Account status reason required'; end if;
  select * into v_target from qralalay.profiles p where p.id=p_profile_id and p.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Profile not found'; end if;
  if p_active and (v_target.auth_user_id is null or not exists(
      select 1 from auth.users u where u.id=v_target.auth_user_id and (
        u.email_confirmed_at is not null or (
          u.phone_confirmed_at is not null and exists(
            select 1 from qralalay.profile_invitation_phones i
            where i.profile_id=v_target.id
              and regexp_replace(i.phone,'^\+','')=regexp_replace(u.phone,'^\+','')
          )
        )
      )
    )) then raise exception using errcode='23514',message='The invited user must verify their email or phone before activation'; end if;
  if not p_active then
    if v_target.id=v_actor.profile_id then raise exception using errcode='23514',message='An official cannot deactivate their own account'; end if;
    if v_target.role='official' and v_target.is_active then
      select exists(select 1 from qralalay.profiles p where p.barangay_id=v_actor.barangay_id and p.role='official' and p.is_active and p.id<>v_target.id)
        into v_other_official_exists;
      if not v_other_official_exists then raise exception using errcode='23514',message='Keep at least one active official'; end if;
    end if;
    if v_target.role='guardian' and exists(select 1 from qralalay.guardian_links gl where gl.guardian_id=v_target.id and gl.status='verified') then
      raise exception using errcode='23514',message='Reassign or revoke verified guardian links first';
    end if;
    if v_target.role='responder' and exists(select 1 from qralalay.case_assignments ca where ca.responder_id=v_target.id and ca.status in ('pending_acceptance','accepted')) then
      raise exception using errcode='23514',message='Reassign active responder cases first';
    end if;
  end if;
  update qralalay.profiles set is_active=p_active,updated_at=now() where id=p_profile_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,case when p_active then 'profile.activated' else 'profile.deactivated' end,'profile',p_profile_id,trim(p_reason));
  return v_target.auth_user_id;
end;
$function$;

revoke all on function public.create_profile_phone_invitation_with_work_info(text,text,text,uuid[],text,text,text) from public,anon;
revoke all on function public.claim_phone_invitation() from public,anon;
revoke all on function public.phone_auth_user_exists(text) from public,anon,authenticated;
revoke all on function public.set_profile_active(uuid,boolean,text) from public,anon;
grant execute on function public.create_profile_phone_invitation_with_work_info(text,text,text,uuid[],text,text,text) to authenticated;
grant execute on function public.claim_phone_invitation() to authenticated;
grant execute on function public.phone_auth_user_exists(text) to service_role;
grant execute on function public.set_profile_active(uuid,boolean,text) to authenticated;

commit;
