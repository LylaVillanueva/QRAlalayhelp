-- Private-schema identity helpers and defense-in-depth row policies.
-- qralalay remains absent from PostgREST's exposed schema list. Client writes
-- must use reviewed public RPCs or Edge Functions, never direct table grants.
begin;

create or replace function qralalay.current_profile()
returns table(profile_id uuid, barangay_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.barangay_id, p.role
  from qralalay.profiles p
  join qralalay.barangays b on b.id = p.barangay_id
  where p.auth_user_id = auth.uid()
    and p.is_active
    and b.is_active;
$function$;

create or replace function qralalay.is_official_for(p_barangay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from qralalay.current_profile() a
    where a.role = 'official' and a.barangay_id = p_barangay_id
  );
$function$;

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
        or r.user_id = a.profile_id
        or exists (
          select 1 from qralalay.guardian_links gl
          where gl.resident_id = r.id
            and gl.guardian_id = a.profile_id
            and gl.status = 'verified'
        )
        or exists (
          select 1 from qralalay.assistance_cases c
          join qralalay.case_assignments ca on ca.case_id = c.id
          where c.resident_id = r.id
            and ca.responder_id = a.profile_id
            and ca.status in ('pending_acceptance', 'accepted', 'completed')
        )
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
        or exists (
          select 1 from qralalay.residents r
          where r.id = c.resident_id and r.user_id = a.profile_id
        )
        or exists (
          select 1 from qralalay.guardian_links gl
          where gl.resident_id = c.resident_id
            and gl.guardian_id = a.profile_id
            and gl.status = 'verified'
        )
        or exists (
          select 1 from qralalay.case_assignments ca
          where ca.case_id = c.id
            and ca.responder_id = a.profile_id
            and ca.status in ('pending_acceptance', 'accepted', 'completed')
        )
      )
  );
$function$;

revoke all on function qralalay.current_profile() from public, anon;
revoke all on function qralalay.is_official_for(uuid) from public, anon;
revoke all on function qralalay.can_view_resident(uuid) from public, anon;
revoke all on function qralalay.can_view_case(uuid) from public, anon;
grant execute on function qralalay.current_profile() to authenticated, service_role;
grant execute on function qralalay.is_official_for(uuid) to authenticated, service_role;
grant execute on function qralalay.can_view_resident(uuid) to authenticated, service_role;
grant execute on function qralalay.can_view_case(uuid) to authenticated, service_role;

alter table qralalay.barangays enable row level security;
alter table qralalay.profiles enable row level security;
alter table qralalay.barangay_contacts enable row level security;
alter table qralalay.residents enable row level security;
alter table qralalay.guardian_links enable row level security;
alter table qralalay.qr_cards enable row level security;
alter table qralalay.assistance_cases enable row level security;
alter table qralalay.case_assignments enable row level security;
alter table qralalay.safety_observations enable row level security;
alter table qralalay.case_reports enable row level security;
alter table qralalay.case_events enable row level security;
alter table qralalay.device_tokens enable row level security;
alter table qralalay.notifications enable row level security;
alter table qralalay.notification_outbox enable row level security;
alter table qralalay.audit_logs enable row level security;

create policy barangays_read_own_active
  on qralalay.barangays for select to authenticated
  using (is_active and exists (
    select 1 from qralalay.current_profile() a where a.barangay_id = id
  ));

create policy profiles_read_self_or_official_scope
  on qralalay.profiles for select to authenticated
  using (
    exists (select 1 from qralalay.current_profile() a where a.profile_id = id)
    or qralalay.is_official_for(barangay_id)
  );

create policy contacts_read_approved_scope
  on qralalay.barangay_contacts for select to authenticated
  using (
    qralalay.barangay_contacts.is_active
    and qralalay.barangay_contacts.verified_by is not null
    and qralalay.barangay_contacts.verified_at is not null
    and exists (
      select 1 from qralalay.current_profile() a
      where a.barangay_id = qralalay.barangay_contacts.barangay_id
    )
  );

create policy residents_read_authorized_scope
  on qralalay.residents for select to authenticated
  using (qralalay.can_view_resident(id));

create policy guardian_links_read_authorized_scope
  on qralalay.guardian_links for select to authenticated
  using (
    qralalay.is_official_for(qralalay.guardian_links.barangay_id)
    or exists (
      select 1 from qralalay.current_profile() a
      where a.profile_id = qralalay.guardian_links.guardian_id
    )
    or exists (select 1 from qralalay.residents r
               join qralalay.current_profile() a on r.user_id = a.profile_id
               where r.id = qralalay.guardian_links.resident_id)
  );

create policy qr_cards_read_authorized_scope
  on qralalay.qr_cards for select to authenticated
  using (qralalay.can_view_resident(resident_id));

create policy assistance_cases_read_authorized_scope
  on qralalay.assistance_cases for select to authenticated
  using (qralalay.can_view_case(id));

create policy case_assignments_read_authorized_scope
  on qralalay.case_assignments for select to authenticated
  using (qralalay.can_view_case(case_id));

create policy safety_observations_read_authorized_scope
  on qralalay.safety_observations for select to authenticated
  using (qralalay.can_view_case(case_id));

create policy case_reports_read_authorized_scope
  on qralalay.case_reports for select to authenticated
  using (qralalay.can_view_case(case_id));

create policy case_events_read_authorized_scope
  on qralalay.case_events for select to authenticated
  using (qralalay.can_view_case(case_id));

create policy device_tokens_read_own
  on qralalay.device_tokens for select to authenticated
  using (exists (select 1 from qralalay.current_profile() a where a.profile_id = user_id));

create policy notifications_read_own
  on qralalay.notifications for select to authenticated
  using (exists (select 1 from qralalay.current_profile() a where a.profile_id = recipient_id));

create policy audit_logs_read_official_scope
  on qralalay.audit_logs for select to authenticated
  using (qralalay.is_official_for(barangay_id));

-- Deliberately no authenticated policy for notification_outbox and no direct
-- authenticated/anon table grants. The service worker uses its server key.
revoke all on all tables in schema qralalay from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema qralalay to service_role;
revoke all on schema qralalay from public, anon, authenticated;
grant usage on schema qralalay to service_role;

commit;
