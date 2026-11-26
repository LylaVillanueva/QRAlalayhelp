-- Reproduce the separately provisioned, verified profile helper.
-- Its body matches Project B's audited public.get_my_profile() definition.
begin;

create or replace function public.get_my_profile()
returns table (
  profile_id uuid,
  barangay_id uuid,
  full_name text,
  role text,
  is_active boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.barangay_id, p.full_name, p.role, p.is_active
  from qralalay.profiles p
  join qralalay.barangays b on b.id = p.barangay_id
  where p.auth_user_id = auth.uid()
    and p.is_active = true
    and b.is_active = true;
$function$;

revoke all on function public.get_my_profile() from public, anon, authenticated;
grant execute on function public.get_my_profile() to authenticated, service_role;

commit;
