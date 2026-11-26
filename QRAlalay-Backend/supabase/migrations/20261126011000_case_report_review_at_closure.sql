-- Official case closure is the existing report approval action. Persist report
-- review separately from case and assignment status in the same transaction.
begin;

create or replace function public.close_assistance_case(
  p_case_id uuid,p_closure_reason text,p_expected_version integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor record;
  v_case qralalay.assistance_cases%rowtype;
  v_assignment qralalay.case_assignments%rowtype;
  v_report qralalay.case_reports%rowtype;
  v_has_guardian boolean;
  v_guardian_safe boolean;
  v_guardian_unsafe boolean;
  v_responder_safe boolean;
begin
  select * into v_actor from qralalay.current_profile();
  if not found or v_actor.role<>'official' then
    raise exception using errcode='42501',message='Active official profile required';
  end if;
  if length(trim(coalesce(p_closure_reason,''))) not between 1 and 1000 then
    raise exception using errcode='22023',message='Closure reason required';
  end if;
  select * into v_case from qralalay.assistance_cases c
    where c.id=p_case_id and c.barangay_id=v_actor.barangay_id for update;
  if not found or v_case.status='closed' then
    raise exception using errcode='P0002',message='Open case not found';
  end if;
  if v_case.version<>p_expected_version then
    raise exception using errcode='40001',message='Case changed; refresh before closing';
  end if;
  select * into v_assignment from qralalay.case_assignments ca
    where ca.case_id=p_case_id and ca.status='accepted' for update;
  if not found then
    raise exception using errcode='23514',message='Accepted responder assignment required';
  end if;
  select * into v_report from qralalay.case_reports cr
    where cr.case_id=p_case_id and cr.assignment_id=v_assignment.id
      and cr.submitted_by=v_assignment.responder_id
    order by cr.submitted_at desc,cr.id desc limit 1 for update;
  if not found then
    raise exception using errcode='23514',message='Responder report required';
  end if;
  select exists(select 1 from qralalay.guardian_links gl
    where gl.resident_id=v_case.resident_id and gl.status='verified') into v_has_guardian;
  select exists(select 1 from (
    select so.observation from qralalay.safety_observations so
    where so.case_id=p_case_id and so.assignment_id=v_assignment.id
      and so.observer_id=v_assignment.responder_id and so.observer_role='responder'
    order by so.observed_at desc,so.created_at desc limit 1
  ) latest where latest.observation='safe') into v_responder_safe;
  select exists(select 1 from (
    select distinct on (so.observer_id) so.observation from qralalay.safety_observations so
    join qralalay.guardian_links gl on gl.resident_id=v_case.resident_id
      and gl.guardian_id=so.observer_id and gl.status='verified'
    where so.case_id=p_case_id and so.observer_role='guardian'
    order by so.observer_id,so.observed_at desc,so.created_at desc
  ) latest where latest.observation='safe') into v_guardian_safe;
  select exists(select 1 from (
    select distinct on (so.observer_id) so.observation from qralalay.safety_observations so
    join qralalay.guardian_links gl on gl.resident_id=v_case.resident_id
      and gl.guardian_id=so.observer_id and gl.status='verified'
    where so.case_id=p_case_id and so.observer_role='guardian'
    order by so.observer_id,so.observed_at desc,so.created_at desc
  ) latest where latest.observation='not_safe') into v_guardian_unsafe;
  if not v_responder_safe or v_guardian_unsafe
    or (v_has_guardian and v_case.guardian_unreachable_at is null and not v_guardian_safe)
    or (v_has_guardian and v_case.guardian_unreachable_at is not null
      and (v_report.submitted_by<>v_assignment.responder_id or length(trim(v_report.actions_taken))=0)) then
    raise exception using errcode='23514',message='Required independent safety confirmations and responder report are incomplete';
  end if;

  update qralalay.case_reports set reviewed_by=v_actor.profile_id,reviewed_at=now()
    where id=v_report.id and reviewed_by is null;
  if not found then
    raise exception using errcode='23514',message='Responder report is already reviewed';
  end if;
  update qralalay.assistance_cases set status='closed',outcome=v_report.outcome,
    closed_by=v_actor.profile_id,closed_at=now(),closure_reason=trim(p_closure_reason),
    version=version+1,updated_at=now() where id=p_case_id;
  update qralalay.case_location_shares set latitude=null,longitude=null,accuracy_meters=null,
    last_shared_at=null,stopped_at=coalesce(stopped_at,now()) where case_id=p_case_id;
  update qralalay.case_assignments set status='completed',ended_at=now()
    where id=v_assignment.id;
  insert into qralalay.case_events(barangay_id,case_id,actor_id,event_type,previous_status,new_status,reason)
    values(v_case.barangay_id,p_case_id,v_actor.profile_id,'case_closed',v_case.status,'closed',trim(p_closure_reason));
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'case_report.reviewed','case_report',v_report.id,
      'approved at official case closure; outcome='||v_report.outcome);
  insert into qralalay.audit_logs(barangay_id,actor_id,action,target_type,target_id,result)
    values(v_case.barangay_id,v_actor.profile_id,'assistance_case.closed','assistance_case',p_case_id,'success');
  return true;
end;
$function$;

revoke all on function public.close_assistance_case(uuid,text,integer) from public,anon;
grant execute on function public.close_assistance_case(uuid,text,integer) to authenticated;
comment on function public.close_assistance_case(uuid,text,integer) is
  'Authorized official closure with required safety/report conditions; records report review separately before closing the case and completing the assignment.';

commit;
