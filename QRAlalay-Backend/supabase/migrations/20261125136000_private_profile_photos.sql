-- Private, short-lived access to resident and account photos.
begin;

alter table qralalay.profiles add column photo_path text;
alter table qralalay.residents add column photo_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-photos','profile-photos',false,716800,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name=excluded.name,
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.can_read_profile_photo(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare v_parts text[]; v_actor record; v_target qralalay.profiles%rowtype;
begin
  v_parts:=pg_catalog.regexp_match(coalesce(p_name,''),
    '^(profiles|residents)/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$');
  if v_parts is null then return false; end if;
  if v_parts[1]='residents' then return qralalay.can_view_resident(v_parts[2]::uuid); end if;
  select * into v_actor from qralalay.current_profile();
  if not found then return false; end if;
  select * into v_target from qralalay.profiles p
    where p.id=v_parts[2]::uuid and p.barangay_id=v_actor.barangay_id;
  return found and (v_target.id=v_actor.profile_id or v_actor.role='official'
    or exists(select 1 from qralalay.case_assignments ca
      where ca.responder_id=v_target.id and ca.status in ('pending_acceptance','accepted','completed')
        and qralalay.can_view_case(ca.case_id)));
end;
$function$;

create or replace function public.can_change_profile_photo(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare v_parts text[]; v_actor record; v_target qralalay.profiles%rowtype;
begin
  v_parts:=pg_catalog.regexp_match(coalesce(p_name,''),
    '^profiles/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$');
  if v_parts is null then return false; end if;
  select * into v_actor from qralalay.current_profile();
  if not found then return false; end if;
  select * into v_target from qralalay.profiles p
    where p.id=v_parts[1]::uuid and p.barangay_id=v_actor.barangay_id;
  return found and (v_target.id=v_actor.profile_id or v_actor.role='official');
end;
$function$;

create or replace function public.can_change_resident_photo(p_name text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $function$
declare v_parts text[]; v_actor record; v_resident qralalay.residents%rowtype;
begin
  v_parts:=pg_catalog.regexp_match(coalesce(p_name,''),
    '^residents/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp)$');
  if v_parts is null then return false; end if;
  select * into v_actor from qralalay.current_profile();
  if not found then return false; end if;
  select * into v_resident from qralalay.residents r where r.id=v_parts[1]::uuid;
  if not found then return false; end if;
  return (v_actor.role='official' and v_actor.barangay_id=v_resident.barangay_id)
    or exists(select 1 from qralalay.guardian_links gl
      where gl.resident_id=v_resident.id and gl.guardian_id=v_actor.profile_id and gl.status='verified');
end;
$function$;

create or replace function public.set_profile_photo_path(p_profile_id uuid,p_path text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_target qralalay.profiles%rowtype; v_previous text;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  select * into v_target from qralalay.profiles p
    where p.id=p_profile_id and p.barangay_id=v_actor.barangay_id for update;
  if not found or (v_target.id<>v_actor.profile_id and v_actor.role<>'official') then
    raise exception using errcode='42501',message='Photo access denied';
  end if;
  if p_path is not null and p_path !~ ('^profiles/'||p_profile_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    raise exception using errcode='22023',message='Invalid photo path';
  end if;
  v_previous:=v_target.photo_path;
  update qralalay.profiles set photo_path=p_path,updated_at=now() where id=p_profile_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'profile.photo_changed','profile',p_profile_id,
      case when p_path is null then 'removed' else 'updated' end);
  return v_previous;
end;
$function$;

create or replace function public.set_resident_photo_path(p_resident_id uuid,p_path text)
returns text language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype; v_previous text;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  select * into v_resident from qralalay.residents r where r.id=p_resident_id for update;
  if not found or not public.can_change_resident_photo(
    'residents/'||p_resident_id::text||'/00000000-0000-4000-8000-000000000000.jpg'
  ) then raise exception using errcode='42501',message='Photo access denied'; end if;
  if p_path is not null and p_path !~ ('^residents/'||p_resident_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$') then
    raise exception using errcode='22023',message='Invalid photo path';
  end if;
  v_previous:=v_resident.photo_path;
  update qralalay.residents set photo_path=p_path,updated_at=now() where id=p_resident_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'resident.photo_changed','resident',p_resident_id,
      case when p_path is null then 'removed' else 'updated' end);
  return v_previous;
end;
$function$;

drop function public.list_accessible_residents_with_birth_date();
create function public.list_accessible_residents_with_photos()
returns table(
  resident_id uuid, full_name text, phone text, address text, resident_category text,
  display_name text, registration_status text, created_at timestamptz,
  guardian_id uuid, guardian_name text, guardian_phone text, guardian_relationship text,
  date_of_birth date, photo_path text
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  return query select r.id,r.full_name,r.phone,r.address,r.resident_category,
      r.display_name,r.registration_status,r.created_at,gl.guardian_id,g.full_name,
      g.phone,gl.relationship,r.date_of_birth,r.photo_path
    from qralalay.residents r
    left join lateral (
      select x.guardian_id,x.relationship from qralalay.guardian_links x
      where x.resident_id=r.id and x.status='verified'
      order by x.verified_at desc limit 1
    ) gl on true
    left join qralalay.profiles g on g.id=gl.guardian_id
    where qralalay.can_view_resident(r.id)
    order by r.full_name,r.id;
end;
$function$;

drop function public.list_barangay_profiles_with_work_info();
create function public.list_barangay_profiles_with_photos()
returns table(
  profile_id uuid,full_name text,phone text,role text,is_active boolean,email text,
  barangay_id uuid,"position" text,home_address text,photo_path text
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  return query select p.id,p.full_name,p.phone,p.role,p.is_active,
      coalesce(u.email::text,ie.email),p.barangay_id,p.position,p.home_address,p.photo_path
    from qralalay.profiles p left join auth.users u on u.id=p.auth_user_id
    left join qralalay.profile_invitation_emails ie on ie.profile_id=p.id
    where p.barangay_id=v_actor.barangay_id order by p.full_name,p.id;
end;
$function$;

drop function public.get_my_profile_with_work_info();
create function public.get_my_profile_with_photos()
returns table(
  profile_id uuid,barangay_id uuid,full_name text,role text,is_active boolean,
  phone text,"position" text,home_address text,barangay_name text,photo_path text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  return query select p.id,p.barangay_id,p.full_name,p.role,p.is_active,
      p.phone,p.position,p.home_address,b.name,p.photo_path
    from qralalay.profiles p join qralalay.barangays b on b.id=p.barangay_id
    where p.auth_user_id=auth.uid() and p.is_active and b.is_active;
end;
$function$;

create function public.list_accessible_case_responder_photos()
returns table(profile_id uuid,photo_path text)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  return query select distinct p.id,p.photo_path
    from qralalay.case_assignments ca
    join qralalay.profiles p on p.id=ca.responder_id
    where ca.status in ('pending_acceptance','accepted','completed') and p.photo_path is not null
      and qralalay.can_view_case(ca.case_id)
    order by p.id;
end;
$function$;

-- Preserve the previous RPC names and result shapes for already-installed clients.
create function public.list_accessible_residents_with_birth_date()
returns table(
  resident_id uuid,full_name text,phone text,address text,resident_category text,
  display_name text,registration_status text,created_at timestamptz,
  guardian_id uuid,guardian_name text,guardian_phone text,guardian_relationship text,
  date_of_birth date
)
language sql stable security definer set search_path = ''
as $function$
  select resident_id,full_name,phone,address,resident_category,display_name,
      registration_status,created_at,guardian_id,guardian_name,guardian_phone,
      guardian_relationship,date_of_birth
    from public.list_accessible_residents_with_photos();
$function$;

create function public.list_barangay_profiles_with_work_info()
returns table(
  profile_id uuid,full_name text,phone text,role text,is_active boolean,email text,
  barangay_id uuid,"position" text,home_address text
)
language sql stable security definer set search_path = ''
as $function$
  select profile_id,full_name,phone,role,is_active,email,barangay_id,"position",home_address
    from public.list_barangay_profiles_with_photos();
$function$;

create function public.get_my_profile_with_work_info()
returns table(
  profile_id uuid,barangay_id uuid,full_name text,role text,is_active boolean,
  phone text,"position" text,home_address text,barangay_name text
)
language sql stable security definer set search_path = ''
as $function$
  select profile_id,barangay_id,full_name,role,is_active,phone,"position",home_address,barangay_name
    from public.get_my_profile_with_photos();
$function$;

drop policy if exists "qralalay_private_photo_read" on storage.objects;
create policy "qralalay_private_photo_read" on storage.objects for select to authenticated
  using (bucket_id='profile-photos' and public.can_read_profile_photo(name));
drop policy if exists "qralalay_private_photo_insert" on storage.objects;
create policy "qralalay_private_photo_insert" on storage.objects for insert to authenticated
  with check (bucket_id='profile-photos' and
    (public.can_change_profile_photo(name) or public.can_change_resident_photo(name)));
drop policy if exists "qralalay_private_photo_delete" on storage.objects;
create policy "qralalay_private_photo_delete" on storage.objects for delete to authenticated
  using (bucket_id='profile-photos' and
    (public.can_change_profile_photo(name) or public.can_change_resident_photo(name)));

revoke all on function public.can_read_profile_photo(text) from public,anon;
revoke all on function public.can_change_profile_photo(text) from public,anon;
revoke all on function public.can_change_resident_photo(text) from public,anon;
revoke all on function public.set_profile_photo_path(uuid,text) from public,anon;
revoke all on function public.set_resident_photo_path(uuid,text) from public,anon;
revoke all on function public.list_accessible_residents_with_photos() from public,anon;
revoke all on function public.list_barangay_profiles_with_photos() from public,anon;
revoke all on function public.get_my_profile_with_photos() from public,anon;
revoke all on function public.list_accessible_case_responder_photos() from public,anon;
revoke all on function public.list_accessible_residents_with_birth_date() from public,anon;
revoke all on function public.list_barangay_profiles_with_work_info() from public,anon;
revoke all on function public.get_my_profile_with_work_info() from public,anon;
grant execute on function public.can_read_profile_photo(text) to authenticated;
grant execute on function public.can_change_profile_photo(text) to authenticated;
grant execute on function public.can_change_resident_photo(text) to authenticated;
grant execute on function public.set_profile_photo_path(uuid,text) to authenticated;
grant execute on function public.set_resident_photo_path(uuid,text) to authenticated;
grant execute on function public.list_accessible_residents_with_photos() to authenticated;
grant execute on function public.list_barangay_profiles_with_photos() to authenticated;
grant execute on function public.get_my_profile_with_photos() to authenticated;
grant execute on function public.list_accessible_case_responder_photos() to authenticated;
grant execute on function public.list_accessible_residents_with_birth_date() to authenticated;
grant execute on function public.list_barangay_profiles_with_work_info() to authenticated;
grant execute on function public.get_my_profile_with_work_info() to authenticated;

commit;
