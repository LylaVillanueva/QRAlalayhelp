-- Private resident date of birth is required by the existing enrollment and
-- profile screens. It remains outside the public QR projection.
begin;

alter table qralalay.residents
  add column date_of_birth date;

comment on column qralalay.residents.date_of_birth is
  'Private resident profile field. Never include in public QR or assistance responses.';

create or replace function public.create_resident_with_birth_date(
  p_full_name text,
  p_phone text default null,
  p_address text default null,
  p_resident_category text default null,
  p_display_name text default null,
  p_assistance_instructions text default null,
  p_public_disclosure_approved boolean default false,
  p_disclosure_reference text default null,
  p_date_of_birth date default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_id uuid;
begin
  if p_date_of_birth > current_date then
    raise exception using errcode='22023', message='Date of birth cannot be in the future';
  end if;
  v_id := public.create_resident(
    p_full_name, p_phone, p_address, p_resident_category, p_display_name,
    p_assistance_instructions, p_public_disclosure_approved, p_disclosure_reference
  );
  update qralalay.residents set date_of_birth=p_date_of_birth where id=v_id;
  return v_id;
end;
$function$;

create or replace function public.update_resident_with_birth_date(
  p_resident_id uuid,
  p_full_name text,
  p_phone text,
  p_address text,
  p_resident_category text,
  p_display_name text,
  p_assistance_instructions text,
  p_public_disclosure_approved boolean,
  p_disclosure_reference text default null,
  p_date_of_birth date default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
begin
  if p_date_of_birth > current_date then
    raise exception using errcode='22023', message='Date of birth cannot be in the future';
  end if;
  if not public.update_resident(
    p_resident_id, p_full_name, p_phone, p_address, p_resident_category,
    p_display_name, p_assistance_instructions, p_public_disclosure_approved,
    p_disclosure_reference
  ) then
    return false;
  end if;
  update qralalay.residents set date_of_birth=p_date_of_birth where id=p_resident_id;
  return true;
end;
$function$;

create or replace function public.list_accessible_residents_with_birth_date()
returns table(
  resident_id uuid, full_name text, phone text, address text, resident_category text,
  display_name text, registration_status text, created_at timestamptz,
  guardian_id uuid, guardian_name text, guardian_phone text, guardian_relationship text,
  date_of_birth date
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  return query
    select r.id,r.full_name,r.phone,r.address,r.resident_category,r.display_name,
      r.registration_status,r.created_at,gl.guardian_id,g.full_name,g.phone,
      gl.relationship,r.date_of_birth
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

revoke all on function public.create_resident_with_birth_date(text,text,text,text,text,text,boolean,text,date) from public,anon;
revoke all on function public.update_resident_with_birth_date(uuid,text,text,text,text,text,text,boolean,text,date) from public,anon;
revoke all on function public.list_accessible_residents_with_birth_date() from public,anon;
grant execute on function public.create_resident_with_birth_date(text,text,text,text,text,text,boolean,text,date) to authenticated;
grant execute on function public.update_resident_with_birth_date(uuid,text,text,text,text,text,text,boolean,text,date) to authenticated;
grant execute on function public.list_accessible_residents_with_birth_date() to authenticated;

commit;
