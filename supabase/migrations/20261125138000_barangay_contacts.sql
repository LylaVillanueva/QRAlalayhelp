-- Barangay contact management stays in the private application schema.
-- Public QR lookup already returns only active, verified contacts.
begin;

alter table qralalay.barangay_contacts
  add constraint barangay_contacts_not_national_emergency check (regexp_replace(phone,'^\+','') <> '911');

create or replace function public.list_my_barangay_contacts()
returns table(
  contact_id uuid,
  label text,
  phone text,
  availability text,
  is_primary boolean,
  is_active boolean,
  verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then
    raise exception using errcode='42501', message='Active QRAlalay profile required';
  end if;
  return query
    select c.id, c.label, c.phone, c.availability, c.is_primary, c.is_active, c.verified_at
    from qralalay.barangay_contacts c
    where c.barangay_id = v_actor.barangay_id
      and (v_actor.role = 'official' or (c.is_active and c.verified_by is not null and c.verified_at is not null))
    order by c.is_primary desc, c.label;
end;
$function$;

create or replace function public.save_barangay_contact(
  p_contact_id uuid,
  p_label text,
  p_phone text,
  p_availability text,
  p_is_primary boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor record;
  v_contact qralalay.barangay_contacts%rowtype;
  v_label text := trim(coalesce(p_label,''));
  v_phone text := trim(coalesce(p_phone,''));
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active barangay official required';
  end if;
  if length(v_label) not between 1 and 100
    or v_phone !~ '^[+]?[0-9]{3,15}$' or regexp_replace(v_phone,'^\+','') = '911'
    or length(coalesce(p_availability,'')) > 120 then
    raise exception using errcode='22023', message='Enter a valid contact label, phone number, and availability';
  end if;

  if coalesce(p_is_primary,false) and p_contact_id is not null then
    update qralalay.barangay_contacts c set is_primary=false
      where c.barangay_id=v_actor.barangay_id and c.id is distinct from p_contact_id and c.is_primary;
  end if;

  if p_contact_id is null then
    insert into qralalay.barangay_contacts(barangay_id,label,phone,availability,is_primary,is_active)
      values(v_actor.barangay_id,v_label,v_phone,nullif(trim(p_availability),''),coalesce(p_is_primary,false),false)
      returning * into v_contact;
    insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
      values(v_actor.barangay_id,v_actor.profile_id,'barangay_contact.created','barangay_contact',v_contact.id,'unverified');
  else
    select * into v_contact from qralalay.barangay_contacts c
      where c.id=p_contact_id and c.barangay_id=v_actor.barangay_id for update;
    if not found then
      raise exception using errcode='22023', message='Contact is not available to this official';
    end if;
    if v_contact.phone is distinct from v_phone then
      update qralalay.barangay_contacts c set label=v_label,phone=v_phone,
        availability=nullif(trim(p_availability),''),is_primary=coalesce(p_is_primary,false),
        is_active=false,verified_by=null,verified_at=null
        where c.id=v_contact.id returning * into v_contact;
    else
      update qralalay.barangay_contacts c set label=v_label,
        availability=nullif(trim(p_availability),''),is_primary=coalesce(p_is_primary,false)
        where c.id=v_contact.id returning * into v_contact;
    end if;
    insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
      values(v_actor.barangay_id,v_actor.profile_id,'barangay_contact.updated','barangay_contact',v_contact.id,
        case when v_contact.is_active then 'active' else 'verification_required' end);
  end if;

  return v_contact.id;
end;
$function$;

create or replace function public.verify_barangay_contact(p_contact_id uuid, p_confirmed boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor record;
  v_contact qralalay.barangay_contacts%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active barangay official required';
  end if;
  select * into v_contact from qralalay.barangay_contacts c
    where c.id=p_contact_id and c.barangay_id=v_actor.barangay_id for update;
  if not found then
    raise exception using errcode='22023', message='Contact is not available to this official';
  end if;
  if coalesce(p_confirmed,false) then
    if v_contact.is_primary then
      update qralalay.barangay_contacts c set is_primary=false
        where c.barangay_id=v_actor.barangay_id and c.id<>v_contact.id and c.is_primary;
    end if;
    update qralalay.barangay_contacts c set is_active=true,
      verified_by=v_actor.profile_id,verified_at=now()
      where c.id=v_contact.id;
  else
    update qralalay.barangay_contacts c set is_active=false,
      verified_by=null,verified_at=null
      where c.id=v_contact.id;
  end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'barangay_contact.verification_changed','barangay_contact',v_contact.id,
      case when coalesce(p_confirmed,false) then 'verified_active' else 'deactivated' end);
  return true;
end;
$function$;

revoke all on function public.list_my_barangay_contacts() from public, anon;
revoke all on function public.save_barangay_contact(uuid,text,text,text,boolean) from public, anon;
revoke all on function public.verify_barangay_contact(uuid,boolean) from public, anon;
grant execute on function public.list_my_barangay_contacts() to authenticated;
grant execute on function public.save_barangay_contact(uuid,text,text,text,boolean) to authenticated;
grant execute on function public.verify_barangay_contact(uuid,boolean) to authenticated;
commit;
