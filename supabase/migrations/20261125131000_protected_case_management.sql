-- Authenticated transactional operations. No application table is exposed to
-- PostgREST; every function derives identity from auth.uid() and checks scope.
begin;

create or replace function public.create_resident(
  p_full_name text,
  p_phone text default null,
  p_address text default null,
  p_resident_category text default null,
  p_display_name text default null,
  p_assistance_instructions text default null,
  p_public_disclosure_approved boolean default false,
  p_disclosure_reference text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_full_name,''))) not between 1 and 200
     or length(coalesce(p_address,'')) > 1000
     or length(coalesce(p_assistance_instructions,'')) > 1000
     or (p_public_disclosure_approved and length(trim(coalesce(p_disclosure_reference,''))) = 0) then
    raise exception using errcode='22023',message='Invalid resident information';
  end if;
  insert into qralalay.residents
    (barangay_id, full_name, phone, address, resident_category, display_name,
     assistance_instructions, public_disclosure_approved, disclosure_approved_by,
     disclosure_approved_at, disclosure_reference, created_by)
  values (v_actor.barangay_id, trim(p_full_name), nullif(trim(p_phone),''), nullif(trim(p_address),''),
     nullif(trim(p_resident_category),''), nullif(trim(p_display_name),''),
     nullif(trim(p_assistance_instructions),''), coalesce(p_public_disclosure_approved,false),
     case when p_public_disclosure_approved then v_actor.profile_id end,
     case when p_public_disclosure_approved then now() end,
     case when p_public_disclosure_approved then trim(p_disclosure_reference) end,
     v_actor.profile_id)
  returning id into v_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
  values(v_actor.barangay_id,v_actor.profile_id,'resident.created','resident',v_id,'success');
  return v_id;
end;
$function$;

create or replace function public.update_resident(
  p_resident_id uuid,
  p_full_name text,
  p_phone text,
  p_address text,
  p_resident_category text,
  p_display_name text,
  p_assistance_instructions text,
  p_public_disclosure_approved boolean,
  p_disclosure_reference text default null
)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_full_name,''))) not between 1 and 200
     or length(coalesce(p_address,'')) > 1000 or length(coalesce(p_assistance_instructions,'')) > 1000
     or (coalesce(p_public_disclosure_approved,false) and length(trim(coalesce(p_disclosure_reference,''))) = 0) then
    raise exception using errcode='22023',message='Invalid resident information';
  end if;
  select * into v_resident from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Resident not found'; end if;
  update qralalay.residents set full_name=trim(p_full_name), phone=nullif(trim(p_phone),''),
    address=nullif(trim(p_address),''), resident_category=nullif(trim(p_resident_category),''),
    display_name=nullif(trim(p_display_name),''), assistance_instructions=nullif(trim(p_assistance_instructions),''),
    public_disclosure_approved=coalesce(p_public_disclosure_approved,false),
    disclosure_approved_by=case when p_public_disclosure_approved then v_actor.profile_id end,
    disclosure_approved_at=case when p_public_disclosure_approved then now() end,
    disclosure_reference=case when p_public_disclosure_approved then trim(p_disclosure_reference) end,
    updated_at=now()
  where id=p_resident_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
  values(v_actor.barangay_id,v_actor.profile_id,'resident.updated','resident',p_resident_id,'success');
  return true;
end;
$function$;

create or replace function public.archive_resident(p_resident_id uuid, p_reason text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Archive reason required'; end if;
  select * into v_resident from qralalay.residents r
    where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Resident not found'; end if;
  if exists(select 1 from qralalay.assistance_cases c where c.resident_id=p_resident_id and c.status <> 'closed') then
    raise exception using errcode='23514',message='Resolve or transfer open cases before archiving';
  end if;
  update qralalay.residents set registration_status='archived',public_disclosure_approved=false,
    disclosure_approved_by=null,disclosure_approved_at=null,disclosure_reference=null,updated_at=now()
    where id=p_resident_id;
  update qralalay.qr_cards set status='revoked',revoked_at=now()
    where resident_id=p_resident_id and status='active';
  update qralalay.guardian_links set status='revoked',revoked_at=now()
    where resident_id=p_resident_id and status in ('pending','verified');
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
  values(v_actor.barangay_id,v_actor.profile_id,'resident.archived','resident',p_resident_id,trim(p_reason));
  return true;
end;
$function$;

create or replace function public.create_guardian_link(p_resident_id uuid,p_guardian_profile_id uuid,p_relationship text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype; v_guardian qralalay.profiles%rowtype; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_relationship,''))) not between 1 and 100 then raise exception using errcode='22023',message='Relationship is required'; end if;
  select * into v_resident from qralalay.residents r where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id for update;
  select * into v_guardian from qralalay.profiles p where p.id=p_guardian_profile_id and p.barangay_id=v_actor.barangay_id
    and p.role='guardian' and p.auth_user_id is not null;
  if not found or v_resident.id is null then raise exception using errcode='P0002',message='Resident or eligible guardian not found'; end if;
  insert into qralalay.guardian_links(barangay_id,resident_id,guardian_id,relationship,status)
  values(v_actor.barangay_id,p_resident_id,p_guardian_profile_id,trim(p_relationship),'pending') returning id into v_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
  values(v_actor.barangay_id,v_actor.profile_id,'guardian_link.created','guardian_link',v_id,'pending');
  return v_id;
end;
$function$;

create or replace function public.review_guardian_link(p_link_id uuid,p_decision text,p_reason text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_link qralalay.guardian_links%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if p_decision not in ('verified','revoked') or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then
    raise exception using errcode='22023',message='Invalid guardian-link decision';
  end if;
  select * into v_link from qralalay.guardian_links gl
    where gl.id=p_link_id and gl.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='Guardian link not found'; end if;
  if v_link.status='revoked' then raise exception using errcode='23514',message='Revoked guardian link cannot be restored'; end if;
  update qralalay.guardian_links set status=p_decision,
    verified_by=case when p_decision='verified' then v_actor.profile_id else verified_by end,
    verified_at=case when p_decision='verified' then now() else verified_at end,
    revoked_at=case when p_decision='revoked' then now() end
  where id=p_link_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
  values(v_actor.barangay_id,v_actor.profile_id,'guardian_link.'||p_decision,'guardian_link',p_link_id,trim(p_reason));
  return true;
end;
$function$;

create or replace function public.issue_qr_card(p_resident_id uuid,p_token_hash text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_resident qralalay.residents%rowtype; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='Invalid QR token'; end if;
  select * into v_resident from qralalay.residents r where r.id=p_resident_id and r.barangay_id=v_actor.barangay_id and r.registration_status='active' for update;
  if not found then raise exception using errcode='P0002',message='Active resident not found'; end if;
  update qralalay.qr_cards set status='revoked',revoked_at=now() where resident_id=p_resident_id and status='active';
  insert into qralalay.qr_cards(barangay_id,resident_id,token_hash,issued_by)
    values(v_actor.barangay_id,p_resident_id,p_token_hash,v_actor.profile_id) returning id into v_id;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'qr_card.issued','resident',p_resident_id,'success');
  return v_id;
end;
$function$;

create or replace function public.revoke_qr_card(p_card_id uuid,p_reason text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_card qralalay.qr_cards%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Revocation reason required'; end if;
  select * into v_card from qralalay.qr_cards c where c.id=p_card_id and c.barangay_id=v_actor.barangay_id for update;
  if not found then raise exception using errcode='P0002',message='QR card not found'; end if;
  if v_card.status='active' then update qralalay.qr_cards set status='revoked',revoked_at=now() where id=p_card_id; end if;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_actor.barangay_id,v_actor.profile_id,'qr_card.revoked','resident',v_card.resident_id,trim(p_reason));
  return true;
end;
$function$;

create or replace function public.acknowledge_assistance_case(p_case_id uuid,p_expected_version integer)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role <> 'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='Case changed; refresh before acknowledging'; end if;
  update qralalay.assistance_cases set acknowledged_by=v_actor.profile_id,acknowledged_at=coalesce(acknowledged_at,now()),
    status=case when status='new' then 'in_progress' else status end,
    version=version+1,updated_at=now() where id=p_case_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'case_acknowledged',v_case.status,
      case when v_case.status='new' then 'in_progress' else v_case.status end);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'assistance_case.acknowledged','assistance_case',p_case_id,'success');
  return true;
end;
$function$;

create or replace function public.assign_responder(p_case_id uuid,p_responder_id uuid,p_expected_version integer)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_responder qralalay.profiles%rowtype; v_assignment uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='Case changed; refresh before assigning'; end if;
  select * into v_responder from qralalay.profiles p where p.id=p_responder_id and p.barangay_id=v_actor.barangay_id and p.role='responder' and p.is_active;
  if not found then raise exception using errcode='22023',message='Active same-barangay responder required'; end if;
  insert into qralalay.case_assignments(barangay_id,case_id,responder_id,assigned_by)
    values(v_case.barangay_id,v_case.id,p_responder_id,v_actor.profile_id) returning id into v_assignment;
  update qralalay.assistance_cases set status=case when status='new' then 'in_progress' else status end,
    version=version+1,updated_at=now() where id=p_case_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'responder_assigned',v_case.status,
      case when v_case.status='new' then 'in_progress' else v_case.status end,p_responder_id::text);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'responder.assigned','assistance_case',p_case_id,'success');
  return v_assignment;
exception when unique_violation then
  raise exception using errcode='23505',message='Case already has an active assignment; reassign it explicitly';
end;
$function$;

create or replace function public.reassign_responder(p_case_id uuid,p_responder_id uuid,p_reason text,p_expected_version integer)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_responder qralalay.profiles%rowtype; v_old qralalay.case_assignments%rowtype; v_new uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Reassignment reason required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='Case changed; refresh before reassigning'; end if;
  select * into v_responder from qralalay.profiles p where p.id=p_responder_id and p.barangay_id=v_actor.barangay_id and p.role='responder' and p.is_active;
  if not found then raise exception using errcode='22023',message='Active same-barangay responder required'; end if;
  select * into v_old from qralalay.case_assignments ca where ca.case_id=p_case_id and ca.status in ('pending_acceptance','accepted') for update;
  if found then update qralalay.case_assignments set status='withdrawn',ended_at=now(),end_reason=trim(p_reason) where id=v_old.id; end if;
  insert into qralalay.case_assignments(barangay_id,case_id,responder_id,assigned_by)
    values(v_case.barangay_id,v_case.id,p_responder_id,v_actor.profile_id) returning id into v_new;
  update qralalay.assistance_cases set version=version+1,updated_at=now() where id=p_case_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'responder_reassigned',v_case.status,v_case.status,trim(p_reason));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'responder.reassigned','assistance_case',p_case_id,'success');
  return v_new;
end;
$function$;

create or replace function public.respond_to_assignment(p_assignment_id uuid,p_decision text,p_reason text default null)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_assignment qralalay.case_assignments%rowtype; v_case qralalay.assistance_cases%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'responder' then raise exception using errcode='42501',message='Active responder profile required'; end if;
  if p_decision not in ('accepted','declined') or (p_decision='declined' and length(trim(coalesce(p_reason,'')))=0) then
    raise exception using errcode='22023',message='Valid assignment decision and decline reason required';
  end if;
  select * into v_assignment from qralalay.case_assignments ca where ca.id=p_assignment_id and ca.responder_id=v_actor.profile_id for update;
  if not found or v_assignment.status<>'pending_acceptance' then raise exception using errcode='P0002',message='Pending assignment not found'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=v_assignment.case_id for update;
  if v_case.status='closed' then raise exception using errcode='23514',message='Closed case cannot be accepted'; end if;
  update qralalay.case_assignments set status=p_decision,
    accepted_at=case when p_decision='accepted' then now() end,
    ended_at=case when p_decision='declined' then now() end,
    end_reason=case when p_decision='declined' then trim(p_reason) end
  where id=p_assignment_id;
  if p_decision='declined' then
    update qralalay.case_assignments set status='withdrawn',ended_at=now(),end_reason='Responder declined assignment'
      where case_id=v_case.id and id<>p_assignment_id and status='pending_acceptance';
  end if;
  update qralalay.assistance_cases set version=version+1,updated_at=now() where id=v_case.id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,v_case.id,v_actor.profile_id,'assignment_'||p_decision,v_case.status,v_case.status,nullif(trim(p_reason),''));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'assignment.'||p_decision,'assistance_case',v_case.id,'success');
  return true;
end;
$function$;

create or replace function public.record_safety_observation(p_case_id uuid,p_observation text,p_basis text,p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_assignment uuid; v_role text; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  if p_observation not in ('safe','not_safe','unable_to_verify') or p_basis not in ('in_person','remote_communication','third_party','unknown')
     or length(coalesce(p_note,''))>2000 then raise exception using errcode='22023',message='Invalid safety observation'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if v_actor.role='official' and v_actor.barangay_id=v_case.barangay_id then v_role:='official';
  elsif v_actor.role='guardian' and exists(select 1 from qralalay.guardian_links gl where gl.resident_id=v_case.resident_id and gl.guardian_id=v_actor.profile_id and gl.status='verified') then v_role:='guardian';
  elsif v_actor.role='responder' then
    select ca.id into v_assignment from qralalay.case_assignments ca where ca.case_id=v_case.id and ca.responder_id=v_actor.profile_id and ca.status='accepted' for update;
    if found then v_role:='responder'; end if;
  end if;
  if v_role is null then raise exception using errcode='42501',message='Not authorized for this case'; end if;
  insert into qralalay.safety_observations(barangay_id,case_id,observer_id,observer_role,assignment_id,observation,basis,note,observed_at)
    values(v_case.barangay_id,v_case.id,v_actor.profile_id,v_role,v_assignment,p_observation,p_basis,nullif(trim(p_note),''),now()) returning id into v_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,v_case.id,v_actor.profile_id,'safety_observation_recorded',v_case.status,v_case.status,v_role||':'||p_observation);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'safety_observation.recorded','assistance_case',v_case.id,'success');
  return v_id;
end;
$function$;

create or replace function public.mark_guardian_unreachable(p_case_id uuid,p_reason text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_time timestamptz;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Document guardian contact attempts'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if not exists(select 1 from qralalay.guardian_links gl where gl.resident_id=v_case.resident_id and gl.status='verified') then
    raise exception using errcode='22023',message='No verified guardian requires an unreachable exception';
  end if;
  update qralalay.assistance_cases set guardian_unreachable_at=coalesce(guardian_unreachable_at,now()),version=version+1,updated_at=now()
    where id=v_case.id returning guardian_unreachable_at into v_time;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,v_case.id,v_actor.profile_id,'guardian_marked_unreachable',v_case.status,v_case.status,trim(p_reason));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'guardian.unreachable_marked','assistance_case',v_case.id,trim(p_reason));
  return v_time;
end;
$function$;

-- Responders may document an unsuccessful contact attempt, but only an
-- official can set guardian_unreachable_at and authorize that exception.
create or replace function public.record_guardian_contact_attempt(p_case_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_assignment uuid; v_event uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'responder' then raise exception using errcode='42501',message='Active responder profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Contact attempt details required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if not exists(select 1 from qralalay.guardian_links gl where gl.resident_id=v_case.resident_id and gl.status='verified') then
    raise exception using errcode='23514',message='No verified guardian contact attempt is required';
  end if;
  select ca.id into v_assignment from qralalay.case_assignments ca
    where ca.case_id=p_case_id and ca.responder_id=v_actor.profile_id and ca.status='accepted' for update;
  if not found then raise exception using errcode='42501',message='Accepted responder assignment required'; end if;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'guardian_contact_attempt_recorded',v_case.status,v_case.status,trim(p_reason)) returning id into v_event;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'guardian.contact_attempt_recorded','assistance_case',p_case_id,trim(p_reason));
  return v_event;
end;
$function$;

-- Record a responder's inability to reach the location; this does not waive
-- guardian confirmation or reassign the case automatically.
create or replace function public.record_responder_unreachable(p_case_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_assignment uuid; v_event uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'responder' then raise exception using errcode='42501',message='Active responder profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Location access difficulty details required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  select ca.id into v_assignment from qralalay.case_assignments ca
    where ca.case_id=p_case_id and ca.responder_id=v_actor.profile_id and ca.status='accepted' for update;
  if not found then raise exception using errcode='42501',message='Accepted responder assignment required'; end if;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'responder_location_unreachable',v_case.status,v_case.status,trim(p_reason)) returning id into v_event;
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'responder.location_unreachable_reported','assistance_case',p_case_id,trim(p_reason));
  return v_event;
end;
$function$;

create or replace function public.submit_case_report(p_case_id uuid,p_actions_taken text,p_resident_condition text,p_outcome text,p_handover_details text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_assignment qralalay.case_assignments%rowtype; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'responder' then raise exception using errcode='42501',message='Active responder profile required'; end if;
  if length(trim(coalesce(p_actions_taken,''))) not between 1 and 4000
     or length(trim(coalesce(p_resident_condition,''))) not between 1 and 2000
     or p_outcome is null or p_outcome not in ('reunited','assisted_independently','referred','transferred')
     or (p_outcome in ('reunited','referred','transferred') and length(trim(coalesce(p_handover_details,'')))=0) then
    raise exception using errcode='22023',message='Invalid case report'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  select * into v_assignment from qralalay.case_assignments ca where ca.case_id=p_case_id and ca.responder_id=v_actor.profile_id and ca.status='accepted' for update;
  if not found then raise exception using errcode='42501',message='Accepted case assignment required'; end if;
  insert into qralalay.case_reports(barangay_id,case_id,assignment_id,submitted_by,actions_taken,resident_condition,outcome,handover_details)
    values(v_case.barangay_id,p_case_id,v_assignment.id,v_actor.profile_id,trim(p_actions_taken),trim(p_resident_condition),p_outcome,nullif(trim(p_handover_details),'')) returning id into v_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'case_report_submitted',v_case.status,v_case.status,p_outcome);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'case_report.submitted','assistance_case',p_case_id,'success');
  return v_id;
end;
$function$;

create or replace function public.close_assistance_case(p_case_id uuid,p_closure_reason text,p_expected_version integer)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype; v_assignment qralalay.case_assignments%rowtype; v_report qralalay.case_reports%rowtype;
  v_has_guardian boolean; v_guardian_safe boolean; v_guardian_unsafe boolean; v_responder_safe boolean;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_closure_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Closure reason required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then raise exception using errcode='P0002',message='Open case not found'; end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='Case changed; refresh before closing'; end if;
  select * into v_assignment from qralalay.case_assignments ca where ca.case_id=p_case_id and ca.status='accepted' for update;
  if not found then raise exception using errcode='23514',message='Accepted responder assignment required'; end if;
  select * into v_report from qralalay.case_reports cr where cr.case_id=p_case_id and cr.assignment_id=v_assignment.id and cr.submitted_by=v_assignment.responder_id order by cr.submitted_at desc limit 1;
  if not found then raise exception using errcode='23514',message='Responder report required'; end if;
  select exists(select 1 from qralalay.guardian_links gl where gl.resident_id=v_case.resident_id and gl.status='verified') into v_has_guardian;
  select exists(select 1 from (
    select so.observation from qralalay.safety_observations so
    where so.case_id=p_case_id and so.assignment_id=v_assignment.id and so.observer_id=v_assignment.responder_id and so.observer_role='responder'
    order by so.observed_at desc,so.created_at desc limit 1
  ) latest where latest.observation='safe') into v_responder_safe;
  select exists(select 1 from (
    select distinct on (so.observer_id) so.observation from qralalay.safety_observations so
    join qralalay.guardian_links gl on gl.resident_id=v_case.resident_id and gl.guardian_id=so.observer_id and gl.status='verified'
    where so.case_id=p_case_id and so.observer_role='guardian' order by so.observer_id,so.observed_at desc,so.created_at desc
  ) latest where latest.observation='safe') into v_guardian_safe;
  select exists(select 1 from (
    select distinct on (so.observer_id) so.observation from qralalay.safety_observations so
    join qralalay.guardian_links gl on gl.resident_id=v_case.resident_id and gl.guardian_id=so.observer_id and gl.status='verified'
    where so.case_id=p_case_id and so.observer_role='guardian' order by so.observer_id,so.observed_at desc,so.created_at desc
  ) latest where latest.observation='not_safe') into v_guardian_unsafe;
  if not v_responder_safe or v_guardian_unsafe
    or (v_has_guardian and v_case.guardian_unreachable_at is null and not v_guardian_safe)
    or (v_has_guardian and v_case.guardian_unreachable_at is not null and (v_report.submitted_by<>v_assignment.responder_id or length(trim(v_report.actions_taken))=0)) then
    raise exception using errcode='23514',message='Required independent safety confirmations and responder report are incomplete';
  end if;
  update qralalay.assistance_cases set status='closed',outcome=v_report.outcome,closed_by=v_actor.profile_id,closed_at=now(),
    closure_reason=trim(p_closure_reason),version=version+1,updated_at=now() where id=p_case_id;
  -- Remove sensitive live coordinates as soon as the official closes the case.
  update qralalay.case_location_shares set latitude=null,longitude=null,accuracy_meters=null,last_shared_at=null,
    stopped_at=coalesce(stopped_at,now()) where case_id=p_case_id;
  update qralalay.case_assignments set status='completed',ended_at=now() where id=v_assignment.id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'case_closed',v_case.status,'closed',trim(p_closure_reason));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'assistance_case.closed','assistance_case',p_case_id,'success');
  return true;
end;
$function$;

create or replace function public.reopen_assistance_case(p_case_id uuid,p_reason text,p_expected_version integer)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_case qralalay.assistance_cases%rowtype;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception using errcode='22023',message='Reopen reason required'; end if;
  select * into v_case from qralalay.assistance_cases c where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status<>'closed' then raise exception using errcode='P0002',message='Closed case not found'; end if;
  if v_case.version<>p_expected_version then raise exception using errcode='40001',message='Case changed; refresh before reopening'; end if;
  update qralalay.assistance_cases set status='in_progress',outcome=null,closed_by=null,closed_at=null,closure_reason=null,
    acknowledged_by=null,acknowledged_at=null,guardian_unreachable_at=null,version=version+1,updated_at=now() where id=p_case_id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'case_reopened','closed','in_progress',trim(p_reason));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'assistance_case.reopened','assistance_case',p_case_id,'success');
  return true;
end;
$function$;

create or replace function public.get_case_history(p_case_id uuid)
returns table(event_id uuid,event_type text,previous_status text,new_status text,reason text,actor_id uuid,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  if not qralalay.can_view_case(p_case_id) then raise exception using errcode='42501',message='Not authorized for this case'; end if;
  select * into v_actor from qralalay.current_profile();
  return query select e.id,e.event_type,e.previous_status,e.new_status,
      case when v_actor.role='official' then e.reason else null end,e.actor_id,e.created_at
    from qralalay.case_events e where e.case_id=p_case_id order by e.created_at,e.id;
end;
$function$;

create or replace function qralalay.can_view_case_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare v_id_text text; v_case_id uuid;
begin
  if p_topic is null or p_topic !~ '^qralalay:case:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then return false; end if;
  v_id_text := substring(p_topic from 15);
  v_case_id := v_id_text::uuid;
  return qralalay.can_view_case(v_case_id);
end;
$function$;

create or replace function qralalay.can_view_profile_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record; v_id_text text;
begin
  if p_topic is null or p_topic !~ '^qralalay:profile:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then return false; end if;
  v_id_text := substring(p_topic from 18);
  select * into v_actor from qralalay.current_profile();
  return found and v_actor.profile_id=v_id_text::uuid;
end;
$function$;

-- The application schema stays private to API roles. Realtime evaluates a
-- policy as the subscribing role, so expose only this narrow public wrapper.
create or replace function public.can_receive_profile_broadcast(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record; v_profile_id text;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or p_topic is null or left(p_topic,17)<>'qralalay:profile:' then return false; end if;
  v_profile_id := substr(p_topic,18);
  return p_topic='qralalay:profile:'||v_actor.profile_id::text and v_profile_id=v_actor.profile_id::text;
end;
$function$;
revoke all on function public.can_receive_profile_broadcast(text) from public,anon;
grant execute on function public.can_receive_profile_broadcast(text) to authenticated;

create policy qralalay_profile_broadcast_read
  on realtime.messages for select to authenticated
  using (public.can_receive_profile_broadcast(realtime.topic()));

create or replace function public.list_barangay_residents()
returns table(resident_id uuid,full_name text,phone text,address text,resident_category text,registration_status text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  return query select r.id,r.full_name,r.phone,r.address,r.resident_category,r.registration_status,r.created_at
    from qralalay.residents r where r.barangay_id=v_actor.barangay_id order by r.full_name,r.id;
end;
$function$;

create or replace function public.list_accessible_residents()
returns table(resident_id uuid,full_name text,phone text,address text,resident_category text,display_name text,
  registration_status text,created_at timestamptz,guardian_id uuid,guardian_name text,guardian_phone text,guardian_relationship text)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  return query select r.id,r.full_name,r.phone,r.address,r.resident_category,r.display_name,r.registration_status,r.created_at,
      gl.guardian_id,g.full_name,g.phone,gl.relationship
    from qralalay.residents r
    left join lateral (
      select x.guardian_id,x.relationship from qralalay.guardian_links x
      where x.resident_id=r.id and x.status='verified' order by x.verified_at desc limit 1
    ) gl on true
    left join qralalay.profiles g on g.id=gl.guardian_id
    where qralalay.can_view_resident(r.id) order by r.full_name,r.id;
end;
$function$;

create or replace function public.list_barangay_profiles()
returns table(profile_id uuid,full_name text,phone text,role text,is_active boolean,email text,barangay_id uuid)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  return query select p.id,p.full_name,p.phone,p.role,p.is_active,u.email::text,p.barangay_id
    from qralalay.profiles p left join auth.users u on u.id=p.auth_user_id
    where p.barangay_id=v_actor.barangay_id order by p.full_name,p.id;
end;
$function$;

create or replace function public.list_my_audit_history(p_limit integer default 100)
returns table(audit_id uuid,actor_id uuid,actor_name text,action text,target_type text,target_id uuid,result text,created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then raise exception using errcode='42501',message='Active official profile required'; end if;
  if p_limit not between 1 and 200 then raise exception using errcode='22023',message='Invalid audit limit'; end if;
  return query select a.id,a.actor_id,p.full_name,a.action,a.target_type,a.target_id,a.result,a.created_at
    from qralalay.audit_logs a left join qralalay.profiles p on p.id=a.actor_id
    where a.barangay_id=v_actor.barangay_id order by a.created_at desc limit p_limit;
end;
$function$;

create or replace function public.list_assistance_cases(p_include_closed boolean default false)
returns table(case_id uuid,barangay_id uuid,resident_id uuid,resident_name text,status text,public_note text,
  latitude double precision,longitude double precision,location_description text,created_at timestamptz,
  updated_at timestamptz,version integer,acknowledged_at timestamptz,assigned_responder_id uuid,
  assignment_id uuid,assignment_status text,assigned_responder_name text,guardian_required boolean,guardian_unreachable_at timestamptz,
  guardian_unreachable_by uuid,guardian_unreachable_reason text,guardian_decision text,responder_decision text,
  report_submitted_at timestamptz,report_submitted_by uuid,final_action_summary text,report_count integer,
  live_latitude double precision,live_longitude double precision,live_location_updated_at timestamptz,
  live_location_sharing boolean,outcome text,closed_at timestamptz,
  responder_unreachable_at timestamptz,responder_unreachable_reason text,guardian_contact_attempt_reason text)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  return query select c.id,c.barangay_id,c.resident_id,r.full_name,c.status,c.public_note,c.latitude,c.longitude,
      c.location_description,c.created_at,c.updated_at,c.version,c.acknowledged_at,a.responder_id,a.id,a.status,ap.full_name,
      (g.guardian_id is not null),c.guardian_unreachable_at,ue.actor_id,ue.reason,gso.observation,rso.observation,
      cr.submitted_at,cr.submitted_by,cr.actions_taken,
      greatest(1,(select count(*)::int from qralalay.case_request_credentials rc where rc.case_id=c.id)),
      ls.latitude,ls.longitude,ls.last_shared_at,
      (ls.latitude is not null and ls.stopped_at is null and ls.expires_at>now() and ls.last_shared_at>now()-interval '30 minutes'),
      c.outcome,c.closed_at,re.created_at,re.reason,ge.reason
    from qralalay.assistance_cases c join qralalay.residents r on r.id=c.resident_id
    left join lateral (select ca.responder_id,ca.id,ca.status from qralalay.case_assignments ca
      where ca.case_id=c.id and ca.status in ('pending_acceptance','accepted','completed')
      order by ca.assigned_at desc limit 1) a on true
    left join qralalay.profiles ap on ap.id=a.responder_id
    left join lateral (select gl.guardian_id from qralalay.guardian_links gl
      where gl.resident_id=c.resident_id and gl.status='verified' order by gl.verified_at desc limit 1) g on true
    left join lateral (select so.observation from qralalay.safety_observations so
      join qralalay.guardian_links gl on gl.resident_id=c.resident_id and gl.guardian_id=so.observer_id and gl.status='verified'
      where so.case_id=c.id and so.observer_role='guardian' order by so.observed_at desc limit 1) gso on true
    left join lateral (select so.observation from qralalay.safety_observations so
      where so.case_id=c.id and so.observer_role='responder' and so.assignment_id=a.id
      order by so.observed_at desc limit 1) rso on true
    left join lateral (select x.submitted_at,x.submitted_by,x.actions_taken from qralalay.case_reports x
      where x.case_id=c.id and x.assignment_id=a.id order by x.submitted_at desc limit 1) cr on true
    left join lateral (select ce.actor_id,ce.reason from qralalay.case_events ce
      where ce.case_id=c.id and ce.event_type='guardian_marked_unreachable' order by ce.created_at desc limit 1) ue on true
    left join lateral (select ce.created_at,ce.reason from qralalay.case_events ce
      where ce.case_id=c.id and ce.event_type='responder_location_unreachable' order by ce.created_at desc limit 1) re on true
    left join lateral (select ce.reason from qralalay.case_events ce
      where ce.case_id=c.id and ce.event_type='guardian_contact_attempt_recorded' order by ce.created_at desc limit 1) ge on true
    left join lateral (select s.latitude,s.longitude,s.last_shared_at,s.stopped_at,s.expires_at
      from qralalay.case_location_shares s where s.case_id=c.id and s.latitude is not null
        and s.expires_at>now() and s.last_shared_at>now()-interval '30 minutes'
      order by s.last_shared_at desc limit 1) ls on true
    where qralalay.can_view_case(c.id) and (p_include_closed or c.status<>'closed')
    order by case when c.status='escalated' then 0 when c.status='new' then 1 else 2 end,c.created_at desc;
end;
$function$;

create or replace function public.get_assistance_case(p_case_id uuid)
returns table(case_id uuid,barangay_id uuid,resident_id uuid,resident_name text,status text,public_note text,
  latitude double precision,longitude double precision,accuracy_meters double precision,location_description text,
  created_at timestamptz,updated_at timestamptz,version integer,acknowledged_by uuid,acknowledged_at timestamptz,
  guardian_unreachable_at timestamptz,closed_by uuid,closed_at timestamptz,outcome text,closure_reason text)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not qralalay.can_view_case(p_case_id) then raise exception using errcode='42501',message='Not authorized for this case'; end if;
  return query select c.id,c.barangay_id,c.resident_id,r.full_name,c.status,c.public_note,c.latitude,c.longitude,
      c.accuracy_meters,c.location_description,c.created_at,c.updated_at,c.version,c.acknowledged_by,c.acknowledged_at,
      c.guardian_unreachable_at,c.closed_by,c.closed_at,c.outcome,
      case when (select cp.role from qralalay.current_profile() cp limit 1)='official' then c.closure_reason else null end
    from qralalay.assistance_cases c join qralalay.residents r on r.id=c.resident_id where c.id=p_case_id;
end;
$function$;

create or replace function public.get_case_shared_location(p_case_id uuid)
returns table(latitude double precision,longitude double precision,accuracy_meters double precision,last_shared_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not qralalay.can_view_case(p_case_id) then raise exception using errcode='42501',message='Not authorized for this case'; end if;
  return query
    select s.latitude,s.longitude,s.accuracy_meters,s.last_shared_at
    from qralalay.case_location_shares s
    join qralalay.assistance_cases c on c.id=s.case_id
    where s.case_id=p_case_id and c.status<>'closed' and s.started_at is not null
      and s.stopped_at is null and s.expires_at>now() and s.last_shared_at>now()-interval '30 minutes'
      and s.latitude is not null
    order by s.last_shared_at desc limit 1;
end;
$function$;

create or replace function public.list_resident_case_history(p_resident_id uuid)
returns table(case_id uuid,status text,outcome text,created_at timestamptz,closed_at timestamptz,version integer)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not qralalay.can_view_resident(p_resident_id) then raise exception using errcode='42501',message='Not authorized for this resident'; end if;
  return query select c.id,c.status,c.outcome,c.created_at,c.closed_at,c.version
    from qralalay.assistance_cases c where c.resident_id=p_resident_id order by c.created_at desc;
end;
$function$;

create or replace function public.get_case_report(p_case_id uuid)
returns table(report_id uuid,actions_taken text,resident_condition text,outcome text,handover_details text,submitted_at timestamptz,reviewed_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not qralalay.can_view_case(p_case_id) then raise exception using errcode='42501',message='Not authorized for this case'; end if;
  return query select cr.id,cr.actions_taken,cr.resident_condition,cr.outcome,cr.handover_details,cr.submitted_at,cr.reviewed_at
    from qralalay.case_reports cr where cr.case_id=p_case_id order by cr.submitted_at desc;
end;
$function$;

create or replace function public.register_my_device_token(p_expo_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record; v_id uuid;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  if p_expo_token is null or length(p_expo_token) not between 20 and 512
     or p_expo_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    raise exception using errcode='22023',message='Invalid push token';
  end if;
  insert into qralalay.device_tokens(barangay_id,user_id,expo_token,is_active)
    values(v_actor.barangay_id,v_actor.profile_id,p_expo_token,true)
  on conflict(expo_token) do update set is_active=true,updated_at=now()
    where qralalay.device_tokens.user_id=excluded.user_id
  returning id into v_id;
  if v_id is null then raise exception using errcode='42501',message='Push token is already registered to another profile'; end if;
  return v_id;
end;
$function$;

create or replace function public.unregister_my_device_token(p_expo_token text)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  update qralalay.device_tokens set is_active=false,updated_at=now()
    where user_id=v_actor.profile_id and expo_token=p_expo_token;
  return true;
end;
$function$;

create or replace function public.list_my_notifications(p_limit integer default 50)
returns table(notification_id uuid,case_id uuid,event_id uuid,event_type text,created_at timestamptz,read_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  if p_limit not between 1 and 100 then raise exception using errcode='22023',message='Invalid notification limit'; end if;
  return query select n.id,n.case_id,n.event_id,n.event_type,n.created_at,n.read_at
    from qralalay.notifications n where n.recipient_id=v_actor.profile_id
    order by n.created_at desc limit p_limit;
end;
$function$;

create or replace function public.mark_my_notification_read(p_notification_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then raise exception using errcode='42501',message='Active profile required'; end if;
  update qralalay.notifications set read_at=coalesce(read_at,now())
    where id=p_notification_id and recipient_id=v_actor.profile_id;
  if not found then raise exception using errcode='P0002',message='Notification not found'; end if;
  return true;
end;
$function$;

-- Every callable API function has explicit role grants; the qralalay schema
-- remains private and application tables retain zero direct client grants.
revoke all on function public.create_resident(text,text,text,text,text,text,boolean,text) from public,anon;
revoke all on function public.update_resident(uuid,text,text,text,text,text,text,boolean,text) from public,anon;
revoke all on function public.archive_resident(uuid,text) from public,anon;
revoke all on function public.create_guardian_link(uuid,uuid,text) from public,anon;
revoke all on function public.review_guardian_link(uuid,text,text) from public,anon;
revoke all on function public.issue_qr_card(uuid,text) from public,anon;
revoke all on function public.revoke_qr_card(uuid,text) from public,anon;
revoke all on function public.acknowledge_assistance_case(uuid,integer) from public,anon;
revoke all on function public.assign_responder(uuid,uuid,integer) from public,anon;
revoke all on function public.reassign_responder(uuid,uuid,text,integer) from public,anon;
revoke all on function public.respond_to_assignment(uuid,text,text) from public,anon;
revoke all on function public.record_safety_observation(uuid,text,text,text) from public,anon;
revoke all on function public.mark_guardian_unreachable(uuid,text) from public,anon;
revoke all on function public.record_guardian_contact_attempt(uuid,text) from public,anon;
revoke all on function public.record_responder_unreachable(uuid,text) from public,anon;
revoke all on function public.submit_case_report(uuid,text,text,text,text) from public,anon;
revoke all on function public.close_assistance_case(uuid,text,integer) from public,anon;
revoke all on function public.reopen_assistance_case(uuid,text,integer) from public,anon;
revoke all on function public.get_case_history(uuid) from public,anon;
revoke all on function public.list_barangay_residents() from public,anon;
revoke all on function public.list_accessible_residents() from public,anon;
revoke all on function public.list_barangay_profiles() from public,anon;
revoke all on function public.list_my_audit_history(integer) from public,anon;
revoke all on function public.list_assistance_cases(boolean) from public,anon;
revoke all on function public.get_assistance_case(uuid) from public,anon;
revoke all on function public.get_case_shared_location(uuid) from public,anon;
revoke all on function public.list_resident_case_history(uuid) from public,anon;
revoke all on function public.get_case_report(uuid) from public,anon;
revoke all on function public.register_my_device_token(text) from public,anon;
revoke all on function public.unregister_my_device_token(text) from public,anon;
revoke all on function public.list_my_notifications(integer) from public,anon;
revoke all on function public.mark_my_notification_read(uuid) from public,anon;
grant execute on function public.create_resident(text,text,text,text,text,text,boolean,text) to authenticated;
grant execute on function public.update_resident(uuid,text,text,text,text,text,text,boolean,text) to authenticated;
grant execute on function public.archive_resident(uuid,text) to authenticated;
grant execute on function public.create_guardian_link(uuid,uuid,text) to authenticated;
grant execute on function public.review_guardian_link(uuid,text,text) to authenticated;
grant execute on function public.issue_qr_card(uuid,text) to authenticated;
grant execute on function public.revoke_qr_card(uuid,text) to authenticated;
grant execute on function public.acknowledge_assistance_case(uuid,integer) to authenticated;
grant execute on function public.assign_responder(uuid,uuid,integer) to authenticated;
grant execute on function public.reassign_responder(uuid,uuid,text,integer) to authenticated;
grant execute on function public.respond_to_assignment(uuid,text,text) to authenticated;
grant execute on function public.record_safety_observation(uuid,text,text,text) to authenticated;
grant execute on function public.mark_guardian_unreachable(uuid,text) to authenticated;
grant execute on function public.record_guardian_contact_attempt(uuid,text) to authenticated;
grant execute on function public.record_responder_unreachable(uuid,text) to authenticated;
grant execute on function public.submit_case_report(uuid,text,text,text,text) to authenticated;
grant execute on function public.close_assistance_case(uuid,text,integer) to authenticated;
grant execute on function public.reopen_assistance_case(uuid,text,integer) to authenticated;
grant execute on function public.get_case_history(uuid) to authenticated;
grant execute on function public.list_barangay_residents() to authenticated;
grant execute on function public.list_accessible_residents() to authenticated;
grant execute on function public.list_barangay_profiles() to authenticated;
grant execute on function public.list_my_audit_history(integer) to authenticated;
grant execute on function public.list_assistance_cases(boolean) to authenticated;
grant execute on function public.get_assistance_case(uuid) to authenticated;
grant execute on function public.get_case_shared_location(uuid) to authenticated;
grant execute on function public.list_resident_case_history(uuid) to authenticated;
grant execute on function public.get_case_report(uuid) to authenticated;
grant execute on function public.register_my_device_token(text) to authenticated;
grant execute on function public.unregister_my_device_token(text) to authenticated;
grant execute on function public.list_my_notifications(integer) to authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
revoke all on function qralalay.can_view_case_topic(text) from public,anon,authenticated;
revoke all on function qralalay.can_view_profile_topic(text) from public,anon,authenticated;

commit;
