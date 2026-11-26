-- Admin-invited Auth users with server-controlled QRAlalay roles. Auth user
-- metadata never determines profile roles or barangay scope.
begin;

create table qralalay.profile_invitation_emails (
  profile_id uuid primary key references qralalay.profiles(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create unique index profile_invitation_email_unique on qralalay.profile_invitation_emails(lower(email));
alter table qralalay.profile_invitation_emails enable row level security;
revoke all on qralalay.profile_invitation_emails from public,anon,authenticated,service_role;

create or replace function public.create_profile_invitation(p_email text,p_full_name text,p_phone text,p_role text,p_ward_ids uuid[] default '{}',p_relationship text default null)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_id uuid; v_email text; v_existing_auth_id uuid; v_existing_active boolean; v_resident_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  v_email:=lower(trim(coalesce(p_email,'')));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(trim(coalesce(p_full_name,''))) not between 1 and 200
     or p_role not in ('official','guardian','responder','resident')
     or length(coalesce(p_phone,''))>40
     or (coalesce(cardinality(p_ward_ids),0)>0 and (p_role<>'guardian' or length(trim(coalesce(p_relationship,''))) not between 1 and 100))
     or coalesce(cardinality(p_ward_ids),0)>25 then
    raise exception using errcode='22023',message='Invalid account invitation';
  end if;
  select ie.profile_id,p.auth_user_id,p.is_active into v_id,v_existing_auth_id,v_existing_active
    from qralalay.profile_invitation_emails ie join qralalay.profiles p on p.id=ie.profile_id
    where lower(ie.email)=v_email for update of p;
  if found then
    if v_existing_auth_id is not null or v_existing_active then
      raise exception using errcode='23505',message='This email already belongs to an active or linked profile';
    end if;
    update qralalay.profiles set full_name=trim(p_full_name),phone=nullif(trim(p_phone),''),role=p_role,updated_at=now()
      where id=v_id;
  else
    insert into qralalay.profiles(barangay_id,full_name,phone,role,is_active)
      values(v_actor.barangay_id,trim(p_full_name),nullif(trim(p_phone),''),p_role,false) returning id into v_id;
    insert into qralalay.profile_invitation_emails(profile_id,email) values(v_id,v_email);
  end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'profile.invitation_requested','profile',v_id,'pending');
  if coalesce(cardinality(p_ward_ids),0)>0 then
    foreach v_resident_id in array p_ward_ids loop
      if not exists(select 1 from qralalay.residents r where r.id=v_resident_id and r.barangay_id=v_actor.barangay_id and r.registration_status='active') then
        raise exception using errcode='22023',message='Guardian relationship includes an unavailable resident';
      end if;
      insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status)
        values(v_actor.barangay_id,v_resident_id,v_id,trim(p_relationship),'pending')
        on conflict (resident_id,guardian_id) where status in ('pending','verified') do update set relationship=excluded.relationship
          where qralalay.guardian_links.status='pending';
      insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
        select v_actor.barangay_id,v_actor.profile_id,'guardian_link.invited','guardian_link',gl.id,'pending'
        from qralalay.guardian_links gl where gl.resident_id=v_resident_id and gl.guardian_id=v_id;
    end loop;
  end if;
  return v_id;
end;
$function$;

create or replace function public.update_profile_details(p_profile_id uuid,p_full_name text,p_phone text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_target qralalay.profiles%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_full_name,''))) not between 1 and 200 or length(coalesce(p_phone,''))>40 then
    raise exception using errcode='22023',message='Invalid account details';
  end if;
  select * into v_target from qralalay.profiles p where p.id=p_profile_id and p.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Profile not found'; end if;
  update qralalay.profiles set full_name=trim(p_full_name),phone=nullif(trim(p_phone),''),updated_at=now() where id=p_profile_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'profile.details_updated','profile',p_profile_id,'success');
  return true;
end;
$function$;

create or replace function public.link_invited_auth_user(p_profile_id uuid,p_auth_user_id uuid,p_email text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_profile qralalay.profiles%rowtype; v_email text;
begin
  v_email:=lower(trim(coalesce(p_email,'')));
  select * into v_profile from qralalay.profiles p where p.id=p_profile_id for update;
  if not found or v_profile.auth_user_id is not null or v_profile.is_active then
    raise exception using errcode='23514',message='Profile is not awaiting an Auth invitation';
  end if;
  if not exists (
    select 1 from qralalay.profile_invitation_emails ie
    join auth.users u on u.id=p_auth_user_id
    where ie.profile_id=p_profile_id and lower(u.email)=v_email and lower(ie.email)=v_email
  ) then raise exception using errcode='42501',message='Invitation email does not match Auth user'; end if;
  update qralalay.profiles set auth_user_id=p_auth_user_id,updated_at=now() where id=p_profile_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_profile.barangay_id,null,'profile.auth_user_linked','profile',p_profile_id,'success');
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
      select 1 from auth.users u where u.id=v_target.auth_user_id and u.email_confirmed_at is not null
    )) then raise exception using errcode='23514',message='The invited user must verify their email before activation'; end if;
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

create or replace function public.change_profile_role(p_profile_id uuid,p_role text,p_reason text)
returns boolean language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_target qralalay.profiles%rowtype; v_other_official boolean;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if p_role not in ('official','guardian','responder','resident') or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then
    raise exception using errcode='22023',message='Invalid profile role change';
  end if;
  select * into v_target from qralalay.profiles p where p.id=p_profile_id and p.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Profile not found'; end if;
  if v_target.id=v_actor.profile_id and p_role<>'official' then raise exception using errcode='23514',message='An official cannot change their own role'; end if;
  if v_target.is_active and v_target.role='official' and p_role<>'official' then
    select exists(select 1 from qralalay.profiles p where p.barangay_id=v_actor.barangay_id and p.role='official' and p.is_active and p.id<>p_profile_id) into v_other_official;
    if not v_other_official then raise exception using errcode='23514',message='Keep at least one active official'; end if;
  end if;
  if v_target.role='guardian' and p_role<>'guardian' and exists(select 1 from qralalay.guardian_links gl where gl.guardian_id=p_profile_id and gl.status='verified') then
    raise exception using errcode='23514',message='Reassign or revoke verified guardian links first';
  end if;
  if v_target.role='responder' and p_role<>'responder' and exists(select 1 from qralalay.case_assignments ca where ca.responder_id=p_profile_id and ca.status in ('pending_acceptance','accepted')) then
    raise exception using errcode='23514',message='Reassign active responder cases first';
  end if;
  update qralalay.profiles set role=p_role,updated_at=now() where id=p_profile_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'profile.role_changed','profile',p_profile_id,v_target.role||' -> '||p_role||'; '||trim(p_reason));
  return true;
end;
$function$;

-- Extend the existing protected account list with pending invite email.
create or replace function public.list_barangay_profiles()
returns table(profile_id uuid,full_name text,phone text,role text,is_active boolean,email text,barangay_id uuid)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  return query select p.id,p.full_name,p.phone,p.role,p.is_active,coalesce(u.email::text,ie.email),p.barangay_id
    from qralalay.profiles p left join auth.users u on u.id=p.auth_user_id
    left join qralalay.profile_invitation_emails ie on ie.profile_id=p.id
    where p.barangay_id=v_actor.barangay_id order by p.full_name,p.id;
end;
$function$;

revoke all on function public.create_profile_invitation(text,text,text,text,uuid[],text) from public,anon;
revoke all on function public.update_profile_details(uuid,text,text) from public,anon;
revoke all on function public.link_invited_auth_user(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.set_profile_active(uuid,boolean,text) from public,anon;
revoke all on function public.change_profile_role(uuid,text,text) from public,anon;
grant execute on function public.create_profile_invitation(text,text,text,text,uuid[],text) to authenticated;
grant execute on function public.update_profile_details(uuid,text,text) to authenticated;
grant execute on function public.link_invited_auth_user(uuid,uuid,text) to service_role;
grant execute on function public.set_profile_active(uuid,boolean,text) to authenticated;
grant execute on function public.change_profile_role(uuid,text,text) to authenticated;

commit;
