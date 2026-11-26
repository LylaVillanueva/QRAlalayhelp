-- Preserve the account position and contact-address fields used by the mobile UI.
begin;

alter table qralalay.profiles add column position text;
alter table qralalay.profiles add column home_address text;
comment on column qralalay.profiles.home_address is 'Private account contact address; never returned by public QR functions.';

create or replace function public.update_profile_details_with_work_info(
  p_profile_id uuid, p_full_name text, p_phone text, p_position text, p_home_address text
)
returns boolean language plpgsql security definer set search_path = ''
as $function$
begin
  if length(coalesce(p_position,'')) > 100 or length(coalesce(p_home_address,'')) > 300 then
    raise exception using errcode='22023',message='Invalid account contact details';
  end if;
  if not public.update_profile_details(p_profile_id,p_full_name,p_phone) then return false; end if;
  update qralalay.profiles set position=nullif(trim(p_position),''),home_address=nullif(trim(p_home_address),''),updated_at=now()
    where id=p_profile_id;
  return true;
end;
$function$;

create or replace function public.create_profile_invitation_with_work_info(
  p_email text,p_full_name text,p_phone text,p_role text,p_ward_ids uuid[],
  p_relationship text,p_position text,p_home_address text
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_profile_id uuid;
begin
  if length(coalesce(p_position,'')) > 100 or length(coalesce(p_home_address,'')) > 300 then
    raise exception using errcode='22023',message='Invalid account contact details';
  end if;
  v_profile_id := public.create_profile_invitation(
    p_email,p_full_name,p_phone,p_role,p_ward_ids,p_relationship
  );
  update qralalay.profiles set position=nullif(trim(p_position),''),
    home_address=nullif(trim(p_home_address),''),updated_at=now()
    where id=v_profile_id;
  return v_profile_id;
end;
$function$;

create or replace function public.list_barangay_profiles_with_work_info()
returns table(
  profile_id uuid,full_name text,phone text,role text,is_active boolean,email text,
  barangay_id uuid,"position" text,home_address text
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  return query select p.id,p.full_name,p.phone,p.role,p.is_active,coalesce(u.email::text,ie.email),
      p.barangay_id,p.position,p.home_address
    from qralalay.profiles p left join auth.users u on u.id=p.auth_user_id
    left join qralalay.profile_invitation_emails ie on ie.profile_id=p.id
    where p.barangay_id=v_actor.barangay_id order by p.full_name,p.id;
end;
$function$;

create or replace function public.get_my_profile_with_work_info()
returns table(
  profile_id uuid,barangay_id uuid,full_name text,role text,is_active boolean,
  phone text,"position" text,home_address text,barangay_name text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  return query select p.id,p.barangay_id,p.full_name,p.role,p.is_active,p.phone,
      p.position,p.home_address,b.name
    from qralalay.profiles p join qralalay.barangays b on b.id=p.barangay_id
    where p.auth_user_id=auth.uid() and p.is_active and b.is_active;
end;
$function$;

revoke all on function public.update_profile_details_with_work_info(uuid,text,text,text,text) from public,anon;
revoke all on function public.create_profile_invitation_with_work_info(text,text,text,text,uuid[],text,text,text) from public,anon;
revoke all on function public.list_barangay_profiles_with_work_info() from public,anon;
revoke all on function public.get_my_profile_with_work_info() from public,anon;
grant execute on function public.update_profile_details_with_work_info(uuid,text,text,text,text) to authenticated;
grant execute on function public.create_profile_invitation_with_work_info(text,text,text,text,uuid[],text,text,text) to authenticated;
grant execute on function public.list_barangay_profiles_with_work_info() to authenticated;
grant execute on function public.get_my_profile_with_work_info() to authenticated;

commit;
