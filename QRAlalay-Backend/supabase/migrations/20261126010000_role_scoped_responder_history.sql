-- Restrict profile and case access to the caller's current role and scope.
-- Responders may inspect only the cases assigned to their own profile; a
-- resident-level history lookup must not reveal other responders' cases.
begin;

create or replace function qralalay.can_view_resident(p_resident_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from qralalay.residents r
    cross join qralalay.current_profile() a
    where r.id = p_resident_id
      and (
        (a.role = 'official' and a.barangay_id = r.barangay_id)
        or (a.role = 'resident' and r.user_id = a.profile_id)
        or (a.role = 'guardian' and exists (
          select 1 from qralalay.guardian_links gl
          where gl.resident_id = r.id
            and gl.guardian_id = a.profile_id
            and gl.status = 'verified'
        ))
        or (a.role = 'responder' and exists (
          select 1 from qralalay.assistance_cases c
          join qralalay.case_assignments ca on ca.case_id = c.id
          where c.resident_id = r.id
            and ca.responder_id = a.profile_id
            and ca.status in ('pending_acceptance', 'accepted', 'completed')
        ))
      )
  );
$function$;

create or replace function qralalay.can_view_case(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from qralalay.assistance_cases c
    cross join qralalay.current_profile() a
    where c.id = p_case_id
      and (
        (a.role = 'official' and a.barangay_id = c.barangay_id)
        or (a.role = 'resident' and exists (
          select 1 from qralalay.residents r
          where r.id = c.resident_id and r.user_id = a.profile_id
        ))
        or (a.role = 'guardian' and exists (
          select 1 from qralalay.guardian_links gl
          where gl.resident_id = c.resident_id
            and gl.guardian_id = a.profile_id
            and gl.status = 'verified'
        ))
        or (a.role = 'responder' and exists (
          select 1 from qralalay.case_assignments ca
          where ca.case_id = c.id
            and ca.responder_id = a.profile_id
            and ca.status in ('pending_acceptance', 'accepted', 'completed')
        ))
      )
  );
$function$;

create or replace function public.list_resident_case_history(p_resident_id uuid)
returns table(case_id uuid,status text,outcome text,created_at timestamptz,closed_at timestamptz,version integer)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_actor record;
begin
  select * into v_actor from qralalay.current_profile();
  if not found then
    raise exception using errcode='42501',message='Active profile required';
  end if;
  if not qralalay.can_view_resident(p_resident_id) then
    raise exception using errcode='42501',message='Not authorized for this resident';
  end if;
  return query
    select c.id,c.status,c.outcome,c.created_at,c.closed_at,c.version
    from qralalay.assistance_cases c
    where c.resident_id=p_resident_id
      and (
        v_actor.role <> 'responder'
        or exists (
          select 1 from qralalay.case_assignments ca
          where ca.case_id=c.id
            and ca.responder_id=v_actor.profile_id
            and ca.status in ('pending_acceptance','accepted','completed')
        )
      )
    order by c.created_at desc,c.id desc;
end;
$function$;

revoke all on function qralalay.can_view_resident(uuid) from public,anon;
revoke all on function qralalay.can_view_case(uuid) from public,anon;
revoke all on function public.list_resident_case_history(uuid) from public,anon;
grant execute on function qralalay.can_view_resident(uuid) to authenticated,service_role;
grant execute on function qralalay.can_view_case(uuid) to authenticated,service_role;
grant execute on function public.list_resident_case_history(uuid) to authenticated;

comment on function public.list_resident_case_history(uuid) is
  'Officials in the resident barangay and linked residents/verified guardians may read full history; responders receive only cases assigned to their current profile.';

commit;
