-- Protect resident edits from full-row replacement and enable secure re-export
-- of newly issued QR credentials without changing existing public QR behavior.
begin;

alter table qralalay.qr_cards add column encrypted_token text;
alter table qralalay.qr_cards
  add constraint qr_cards_encrypted_token_v1_format
  check (encrypted_token is null or encrypted_token ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{79}$');
comment on column qralalay.qr_cards.encrypted_token is
  'Versioned AES-GCM ciphertext of the QR bearer token; key remains in Edge Function secrets. NULL marks legacy cards that cannot be re-exported.';

create function public.get_resident_edit_details(p_resident_id uuid)
returns table(
  resident_id uuid, full_name text, phone text, address text, resident_category text,
  display_name text, assistance_instructions text, registration_status text,
  date_of_birth date, public_disclosure_approved boolean, disclosure_reference text,
  disclosure_approved_by uuid, disclosure_approved_at timestamptz, photo_path text,
  guardian_id uuid, guardian_name text, guardian_phone text, guardian_relationship text,
  qr_card_id uuid, qr_card_issued_at timestamptz, qr_card_reexportable boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if not exists (
    select 1 from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id
  ) then
    raise exception using errcode='P0002', message='Resident not found';
  end if;
  return query
    select r.id,r.full_name,r.phone,r.address,r.resident_category,r.display_name,
      r.assistance_instructions,r.registration_status,r.date_of_birth,
      r.public_disclosure_approved,r.disclosure_reference,r.disclosure_approved_by,
      r.disclosure_approved_at,r.photo_path,gl.guardian_id,g.full_name,g.phone,
      gl.relationship,qc.id,qc.issued_at,(qc.encrypted_token is not null)
    from qralalay.residents r
    left join lateral (
      select x.guardian_id,x.relationship from qralalay.guardian_links x
      where x.resident_id=r.id and x.status='verified'
      order by x.verified_at desc,x.created_at desc,x.id desc limit 1
    ) gl on true
    left join qralalay.profiles g on g.id=gl.guardian_id
    left join lateral (
      select c.id,c.issued_at,c.encrypted_token from qralalay.qr_cards c
      where c.resident_id=r.id and c.barangay_id=r.barangay_id and c.status='active'
      order by c.issued_at desc,c.id desc limit 1
    ) qc on true
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id;
end;
$function$;

-- App-facing name and compact field set requested by the mobile integration.
-- The underlying helper enforces the same active-official and barangay checks.
create function public.get_resident_for_edit(p_resident_id uuid)
returns table(
  resident_id uuid, full_name text, display_name text, phone text, address text,
  resident_category text, date_of_birth date, assistance_instructions text,
  public_disclosure_approved boolean, disclosure_reference text,
  registration_status text
)
language sql stable security definer set search_path = ''
as $function$
  select d.resident_id,d.full_name,d.display_name,d.phone,d.address,
    d.resident_category,d.date_of_birth,d.assistance_instructions,
    d.public_disclosure_approved,d.disclosure_reference,d.registration_status
  from public.get_resident_edit_details(p_resident_id) d;
$function$;

create function public.list_resident_guardian_links(p_resident_id uuid)
returns table(
  link_id uuid, guardian_profile_id uuid, guardian_name text, guardian_phone text,
  guardian_email text, guardian_is_active boolean, guardian_email_confirmed boolean,
  relationship text, status text, created_at timestamptz, verified_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if not exists (
    select 1 from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id
  ) then
    raise exception using errcode='P0002', message='Resident not found';
  end if;
  return query
    select gl.id,p.id,p.full_name,p.phone,coalesce(ie.email,u.email::text),p.is_active,
      coalesce(u.email_confirmed_at is not null,false),gl.relationship,gl.status,
      gl.created_at,gl.verified_at
    from qralalay.guardian_links gl
    join qralalay.profiles p on p.id=gl.guardian_id and p.barangay_id=gl.barangay_id
    left join auth.users u on u.id=p.auth_user_id
    left join qralalay.profile_invitation_emails ie on ie.profile_id=p.id
    where gl.resident_id=p_resident_id and gl.barangay_id=v_actor.barangay_id
      and gl.status in ('pending','verified')
    order by gl.created_at desc,gl.id;
end;
$function$;

create function public.list_barangay_profiles_with_status()
returns table(profile_id uuid,email_confirmed boolean,has_auth_user boolean)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  return query
    select p.id,coalesce(u.email_confirmed_at is not null,false),(u.id is not null)
    from qralalay.profiles p
    left join auth.users u on u.id=p.auth_user_id
    where p.barangay_id=v_actor.barangay_id
    order by p.full_name,p.id;
end;
$function$;

create function public.get_resident_qr_card(p_resident_id uuid)
returns table(card_id uuid,status text,issued_at timestamptz,issued_by_name text)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if not exists (
    select 1 from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id
      and r.registration_status='active'
  ) then
    raise exception using errcode='P0002', message='Active resident not found';
  end if;
  return query
    select qc.id,qc.status,qc.issued_at,p.full_name
    from qralalay.qr_cards qc
    join qralalay.profiles p on p.id=qc.issued_by and p.barangay_id=qc.barangay_id
    where qc.resident_id=p_resident_id and qc.barangay_id=v_actor.barangay_id
      and qc.status='active'
    order by qc.issued_at desc,qc.id desc
    limit 1;
end;
$function$;

create function public.update_resident_fields(p_resident_id uuid,p_changes jsonb)
returns table(
  resident_id uuid, full_name text, phone text, address text, resident_category text,
  display_name text, assistance_instructions text, registration_status text,
  date_of_birth date, public_disclosure_approved boolean, disclosure_reference text,
  disclosure_approved_by uuid, disclosure_approved_at timestamptz, photo_path text,
  guardian_id uuid, guardian_name text, guardian_phone text, guardian_relationship text,
  qr_card_id uuid, qr_card_issued_at timestamptz, qr_card_reexportable boolean
)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor record;
  v_resident qralalay.residents%rowtype;
  v_field text;
  v_fields text;
  v_date_of_birth date;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception using errcode='22023', message='Resident changes must be a non-empty object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_changes) as fields(field_name)
    where field_name not in (
      'full_name','phone','address','resident_category','display_name',
      'assistance_instructions','date_of_birth'
    )
  ) then
    raise exception using errcode='22023', message='Unsupported resident update field';
  end if;

  select * into v_resident from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002', message='Resident not found'; end if;

  if p_changes ? 'full_name' and (
    jsonb_typeof(p_changes->'full_name') <> 'string'
    or length(trim(p_changes->>'full_name')) not between 1 and 200
  ) then
    raise exception using errcode='22023', message='Invalid resident name';
  end if;
  foreach v_field in array array['phone','address','resident_category','display_name','assistance_instructions'] loop
    if p_changes ? v_field and jsonb_typeof(p_changes->v_field) not in ('string','null') then
      raise exception using errcode='22023', message='Invalid resident text field';
    end if;
  end loop;
  if p_changes ? 'address' and jsonb_typeof(p_changes->'address')='string'
     and length(p_changes->>'address') > 1000 then
    raise exception using errcode='22023', message='Invalid resident address';
  end if;
  if p_changes ? 'assistance_instructions' and jsonb_typeof(p_changes->'assistance_instructions')='string'
     and length(p_changes->>'assistance_instructions') > 1000 then
    raise exception using errcode='22023', message='Invalid assistance instructions';
  end if;
  if p_changes ? 'date_of_birth' then
    if jsonb_typeof(p_changes->'date_of_birth') not in ('string','null') then
      raise exception using errcode='22023', message='Invalid date of birth';
    end if;
    if jsonb_typeof(p_changes->'date_of_birth')='null' then
      v_date_of_birth := null;
    else
      begin
        v_date_of_birth := (p_changes->>'date_of_birth')::date;
      exception when others then
        raise exception using errcode='22023', message='Invalid date of birth';
      end;
      if v_date_of_birth > current_date then
        raise exception using errcode='22023', message='Date of birth cannot be in the future';
      end if;
    end if;
  end if;

  update qralalay.residents r set
    full_name = case when p_changes ? 'full_name' then trim(p_changes->>'full_name') else r.full_name end,
    phone = case when p_changes ? 'phone' then nullif(trim(p_changes->>'phone'),'') else r.phone end,
    address = case when p_changes ? 'address' then nullif(trim(p_changes->>'address'),'') else r.address end,
    resident_category = case when p_changes ? 'resident_category' then nullif(trim(p_changes->>'resident_category'),'') else r.resident_category end,
    display_name = case when p_changes ? 'display_name' then nullif(trim(p_changes->>'display_name'),'') else r.display_name end,
    assistance_instructions = case when p_changes ? 'assistance_instructions' then nullif(trim(p_changes->>'assistance_instructions'),'') else r.assistance_instructions end,
    date_of_birth = case when p_changes ? 'date_of_birth' then v_date_of_birth else r.date_of_birth end,
    updated_at = now()
  where r.id=p_resident_id;

  select string_agg(field_name,',' order by field_name) into v_fields
  from jsonb_object_keys(p_changes) as fields(field_name);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'resident.updated','resident',p_resident_id,'fields:'||v_fields);
  return query select * from public.get_resident_edit_details(p_resident_id);
end;
$function$;

create function public.set_resident_public_disclosure(
  p_resident_id uuid,p_approved boolean,p_disclosure_reference text,p_reason text
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if p_approved is null or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then
    raise exception using errcode='22023', message='Disclosure decision and reason are required';
  end if;
  if p_approved and length(trim(coalesce(p_disclosure_reference,''))) not between 1 and 1000 then
    raise exception using errcode='22023', message='Disclosure approval reference is required';
  end if;
  if not p_approved and nullif(trim(coalesce(p_disclosure_reference,'')),'') is not null then
    raise exception using errcode='22023', message='Do not include an approval reference when revoking disclosure';
  end if;
  update qralalay.residents r set
    public_disclosure_approved=p_approved,
    disclosure_approved_by=case when p_approved then v_actor.profile_id else null end,
    disclosure_approved_at=case when p_approved then now() else null end,
    disclosure_reference=case when p_approved then trim(p_disclosure_reference) else null end,
    updated_at=now()
  where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id;
  if not found then raise exception using errcode='P0002', message='Resident not found'; end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,
      case when p_approved then 'resident.public_disclosure_approved' else 'resident.public_disclosure_revoked' end,
      'resident',p_resident_id,trim(p_reason));
  return true;
end;
$function$;

-- Retire full-replacement client RPCs. Internal security-definer calls remain
-- available to their owner; clients must use the explicit JSON patch contract.
revoke all on function public.update_resident(uuid,text,text,text,text,text,text,boolean,text) from public,anon,authenticated,service_role;
revoke all on function public.update_resident_with_birth_date(uuid,text,text,text,text,text,text,boolean,text,date) from public,anon,authenticated,service_role;
comment on function public.update_resident(uuid,text,text,text,text,text,text,boolean,text) is
  'Internal legacy full-replacement helper; client execution revoked. Use update_resident_fields.';
comment on function public.update_resident_with_birth_date(uuid,text,text,text,text,text,text,boolean,text,date) is
  'Legacy full-replacement RPC; client execution revoked. Use update_resident_fields.';

revoke all on function public.get_resident_edit_details(uuid) from public,anon,service_role;
revoke all on function public.get_resident_for_edit(uuid) from public,anon,service_role;
revoke all on function public.list_resident_guardian_links(uuid) from public,anon,service_role;
revoke all on function public.list_barangay_profiles_with_status() from public,anon,service_role;
revoke all on function public.get_resident_qr_card(uuid) from public,anon,service_role;
revoke all on function public.update_resident_fields(uuid,jsonb) from public,anon,service_role;
revoke all on function public.set_resident_public_disclosure(uuid,boolean,text,text) from public,anon,service_role;
grant execute on function public.get_resident_edit_details(uuid) to authenticated;
grant execute on function public.get_resident_for_edit(uuid) to authenticated;
grant execute on function public.list_resident_guardian_links(uuid) to authenticated;
grant execute on function public.list_barangay_profiles_with_status() to authenticated;
grant execute on function public.get_resident_qr_card(uuid) to authenticated;
grant execute on function public.update_resident_fields(uuid,jsonb) to authenticated;
grant execute on function public.set_resident_public_disclosure(uuid,boolean,text,text) to authenticated;

create function public.issue_qr_card_secure(
  p_card_id uuid,p_resident_id uuid,p_token_hash text,p_encrypted_token text
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  if p_card_id is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_encrypted_token !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{79}$' then
    raise exception using errcode='22023', message='Invalid QR credential';
  end if;
  select * into v_resident from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id
      and r.registration_status='active' for update;
  if not found then raise exception using errcode='P0002', message='Active resident not found'; end if;
  update qralalay.qr_cards set status='revoked',revoked_at=now()
    where resident_id=p_resident_id and status='active';
  insert into qralalay.qr_cards(id,barangay_id,resident_id,token_hash,encrypted_token,issued_by)
    values(p_card_id,v_actor.barangay_id,p_resident_id,p_token_hash,p_encrypted_token,v_actor.profile_id);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'qr_card.issued','resident',p_resident_id,'success');
  return p_card_id;
end;
$function$;

create function public.get_qr_card_for_export(p_card_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_card qralalay.qr_cards%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then
    raise exception using errcode='42501', message='Active official profile required';
  end if;
  select qc.* into v_card from qralalay.qr_cards qc
    join qralalay.residents r on r.id=qc.resident_id and r.barangay_id=qc.barangay_id
    join qralalay.barangays b on b.id=qc.barangay_id and b.is_active
    where qc.id=p_card_id and qc.barangay_id=v_actor.barangay_id
      and qc.status='active' and r.registration_status='active'
    for update of qc;
  if not found then raise exception using errcode='P0002', message='Active QR card not found'; end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'qr_card.export_requested','qr_card',v_card.id,
      case when v_card.encrypted_token is null then 'legacy_unavailable' else 'success' end);
  return jsonb_build_object(
    'cardId',v_card.id,'residentId',v_card.resident_id,'tokenHash',v_card.token_hash,
    'encryptedToken',v_card.encrypted_token,'reexportable',(v_card.encrypted_token is not null)
  );
end;
$function$;

revoke all on function public.issue_qr_card(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.issue_qr_card_secure(uuid,uuid,text,text) from public,anon,service_role;
revoke all on function public.get_qr_card_for_export(uuid) from public,anon,service_role;
grant execute on function public.issue_qr_card_secure(uuid,uuid,text,text) to authenticated;
grant execute on function public.get_qr_card_for_export(uuid) to authenticated;
comment on function public.issue_qr_card_secure(uuid,uuid,text,text) is
  'Issues a QR credential with a server-encrypted export copy and retains only its hash for public lookup.';
comment on function public.get_qr_card_for_export(uuid) is
  'Returns encrypted QR credential material to an authorized same-barangay official for Edge Function decryption; never returns plaintext.';

commit;
