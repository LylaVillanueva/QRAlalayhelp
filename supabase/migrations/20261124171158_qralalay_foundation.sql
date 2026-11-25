-- QRAlalay v3: fresh isolated Supabase database ONLY.
-- This is a locked-down structural baseline, not an upgrade of RESQR2.
-- No public endpoints, workflow RPCs or notification worker are installed here.
begin;
create schema qralalay;
revoke all on schema qralalay from public, anon, authenticated;
grant usage on schema qralalay to service_role;
alter default privileges in schema qralalay revoke all on tables from public, anon, authenticated;
alter default privileges in schema qralalay revoke execute on functions from public, anon, authenticated;
set local search_path = qralalay, pg_catalog;

create table barangays (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) between 1 and 150),
 is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table profiles (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 barangay_id uuid not null references barangays(id),
 full_name text not null check (length(trim(full_name)) between 1 and 200),
 role text not null check (role in ('official','guardian','responder','resident')),
 phone text, is_active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (id, barangay_id)
);
create table barangay_contacts (
 id uuid primary key default gen_random_uuid(),
 barangay_id uuid not null references barangays(id),
 label text not null, phone text not null check (phone ~ '^[+]?[0-9]{3,15}$'),
 availability text, is_primary boolean not null default false,
 is_active boolean not null default false,
 verified_by uuid, verified_at timestamptz,
 foreign key (verified_by,barangay_id) references profiles(id,barangay_id),
 check (not is_active or (verified_by is not null and verified_at is not null)),
 check (phone <> '911')
);
create unique index one_primary_contact on barangay_contacts(barangay_id) where is_primary and is_active;
create table residents (
 id uuid primary key default gen_random_uuid(),
 barangay_id uuid not null references barangays(id),
 user_id uuid unique, full_name text not null check (length(trim(full_name)) between 1 and 200),
 phone text, address text, resident_category text,
 display_name text, assistance_instructions text,
 public_disclosure_approved boolean not null default false,
 disclosure_approved_by uuid, disclosure_approved_at timestamptz, disclosure_reference text,
 registration_status text not null default 'active' check (registration_status in ('active','archived')),
 created_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,barangay_id),
 foreign key (user_id,barangay_id) references profiles(id,barangay_id),
 foreign key (created_by,barangay_id) references profiles(id,barangay_id),
 foreign key (disclosure_approved_by,barangay_id) references profiles(id,barangay_id),
 check (not public_disclosure_approved or (disclosure_approved_by is not null and disclosure_approved_at is not null and nullif(trim(disclosure_reference),'') is not null))
);
create table guardian_links (
 id uuid primary key default gen_random_uuid(),
 barangay_id uuid not null references barangays(id), resident_id uuid not null, guardian_id uuid not null,
 relationship text not null, status text not null default 'pending' check (status in ('pending','verified','revoked')),
 verified_by uuid, verified_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key (resident_id,barangay_id) references residents(id,barangay_id),
 foreign key (guardian_id,barangay_id) references profiles(id,barangay_id),
 foreign key (verified_by,barangay_id) references profiles(id,barangay_id),
 check (status <> 'verified' or (verified_by is not null and verified_at is not null and revoked_at is null)),
 check ((status = 'revoked') = (revoked_at is not null))
);
create unique index one_current_guardian_link on guardian_links(resident_id,guardian_id) where status in ('pending','verified');
create table qr_cards (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), resident_id uuid not null,
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 status text not null default 'active' check (status in ('active','revoked')),
 issued_by uuid not null, issued_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key (resident_id,barangay_id) references residents(id,barangay_id),
 foreign key (issued_by,barangay_id) references profiles(id,barangay_id),
 unique (id,resident_id,barangay_id),
 check ((status = 'revoked') = (revoked_at is not null))
);
create unique index one_active_card on qr_cards(resident_id) where status = 'active';
create table assistance_cases (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), resident_id uuid not null, qr_card_id uuid,
 status text not null default 'new' check (status in ('new','in_progress','escalated','closed')),
 public_note text check (length(public_note) <= 1000),
 latitude double precision, longitude double precision, accuracy_meters double precision,
 location_description text check (length(location_description) <= 500), location_captured_at timestamptz,
 idempotency_key uuid unique, request_token_hash text unique check (request_token_hash ~ '^[0-9a-f]{64}$'),
 request_payload_hash text check (request_payload_hash ~ '^[0-9a-f]{64}$'),
 acknowledged_by uuid, acknowledged_at timestamptz,
 outcome text check (outcome in ('reunited','assisted_independently','referred','transferred','cancelled','duplicate')),
 closed_by uuid, closed_at timestamptz, closure_reason text,
 version integer not null default 1 check (version > 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,barangay_id),
 foreign key (resident_id,barangay_id) references residents(id,barangay_id),
 foreign key (qr_card_id,resident_id,barangay_id) references qr_cards(id,resident_id,barangay_id),
 foreign key (acknowledged_by,barangay_id) references profiles(id,barangay_id),
 foreign key (closed_by,barangay_id) references profiles(id,barangay_id),
 check ((latitude is null) = (longitude is null)),
 check (latitude between -90 and 90 and longitude between -180 and 180 or latitude is null),
 check (accuracy_meters is null or (latitude is not null and accuracy_meters >= 0 and accuracy_meters < 'Infinity'::float8)),
 check ((acknowledged_by is null) = (acknowledged_at is null)),
 check (qr_card_id is null or (idempotency_key is not null and request_token_hash is not null and request_payload_hash is not null)),
 check ((status = 'closed' and closed_at is not null and outcome is not null and nullif(trim(closure_reason),'') is not null and (closed_by is not null or outcome = 'cancelled')) or (status <> 'closed' and closed_at is null and closed_by is null and outcome is null and closure_reason is null))
);
create table case_assignments (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), case_id uuid not null,
 responder_id uuid not null, assigned_by uuid not null,
 status text not null default 'pending_acceptance' check (status in ('pending_acceptance','accepted','declined','withdrawn','completed')),
 assigned_at timestamptz not null default now(), accepted_at timestamptz, ended_at timestamptz, end_reason text,
 foreign key (case_id,barangay_id) references assistance_cases(id,barangay_id),
 foreign key (responder_id,barangay_id) references profiles(id,barangay_id),
 foreign key (assigned_by,barangay_id) references profiles(id,barangay_id),
 unique (id,case_id,barangay_id,responder_id),
 check ((status in ('declined','withdrawn','completed')) = (ended_at is not null)),
 check (status not in ('accepted','completed') or accepted_at is not null)
);
create unique index one_active_assignment on case_assignments(case_id) where status in ('pending_acceptance','accepted');
create table safety_observations (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), case_id uuid not null,
 observer_id uuid not null, observer_role text not null check (observer_role in ('guardian','responder','official')),
 assignment_id uuid, observation text not null check (observation in ('safe','not_safe','unable_to_verify')),
 basis text not null check (basis in ('in_person','remote_communication','third_party','unknown')),
 note text check (length(note) <= 2000), observed_at timestamptz not null, created_at timestamptz not null default now(),
 foreign key (case_id,barangay_id) references assistance_cases(id,barangay_id),
 foreign key (observer_id,barangay_id) references profiles(id,barangay_id),
 foreign key (assignment_id,case_id,barangay_id,observer_id) references case_assignments(id,case_id,barangay_id,responder_id),
 check ((observer_role = 'responder') = (assignment_id is not null))
);
create table case_reports (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), case_id uuid not null,
 assignment_id uuid not null, submitted_by uuid not null,
 actions_taken text not null check (length(trim(actions_taken)) between 1 and 4000),
 resident_condition text not null check (length(trim(resident_condition)) between 1 and 2000),
 outcome text not null check (outcome in ('reunited','assisted_independently','referred','transferred')),
 handover_details text, submitted_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz,
 foreign key (case_id,barangay_id) references assistance_cases(id,barangay_id),
 foreign key (assignment_id,case_id,barangay_id,submitted_by) references case_assignments(id,case_id,barangay_id,responder_id),
 foreign key (reviewed_by,barangay_id) references profiles(id,barangay_id),
 check ((reviewed_by is null) = (reviewed_at is null)),
 check (outcome not in ('reunited','referred','transferred') or nullif(trim(handover_details),'') is not null)
);
create table case_events (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), case_id uuid not null,
 actor_id uuid, event_type text not null, previous_status text, new_status text, reason text,
 unique (id,case_id,barangay_id),
 created_at timestamptz not null default now(),
 foreign key (case_id,barangay_id) references assistance_cases(id,barangay_id),
 foreign key (actor_id,barangay_id) references profiles(id,barangay_id)
);
create table device_tokens (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), user_id uuid not null,
 expo_token text not null unique, is_active boolean not null default true, updated_at timestamptz not null default now(),
 foreign key (user_id,barangay_id) references profiles(id,barangay_id)
);
create table notifications (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), recipient_id uuid not null,
 case_id uuid not null, event_id uuid not null, event_type text not null,
 foreign key (event_id,case_id,barangay_id) references case_events(id,case_id,barangay_id),
 read_at timestamptz, created_at timestamptz not null default now(),
 foreign key (recipient_id,barangay_id) references profiles(id,barangay_id),
 foreign key (case_id,barangay_id) references assistance_cases(id,barangay_id),
 unique (event_id,recipient_id)
);
create table notification_outbox (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references notifications(id),
 device_token_id uuid not null references device_tokens(id),
 status text not null default 'pending' check (status in ('pending','processing','awaiting_receipt','provider_accepted','failed','cancelled')),
 attempts integer not null default 0 check (attempts >= 0), next_attempt_at timestamptz not null default now(),
 lease_until timestamptz, lease_token uuid, provider_ticket_id text, last_error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (notification_id,device_token_id)
);
create table audit_logs (
 id uuid primary key default gen_random_uuid(), barangay_id uuid not null references barangays(id), actor_id uuid,
 action text not null, target_type text not null, target_id uuid, result text not null,
 correlation_id uuid, created_at timestamptz not null default now(),
 foreign key (actor_id,barangay_id) references profiles(id,barangay_id)
);
-- Query indexes for ordinary dashboard and history operations.
create index profiles_barangay_role on profiles(barangay_id,role,is_active);
create index residents_barangay_status on residents(barangay_id,registration_status);
create index guardian_links_guardian on guardian_links(guardian_id,status);
create index cases_barangay_status on assistance_cases(barangay_id,status,created_at desc);
create index cases_resident_history on assistance_cases(resident_id,created_at desc);
create index assignments_responder on case_assignments(responder_id,status);
create index observations_case on safety_observations(case_id,created_at desc);
create index reports_case on case_reports(case_id,submitted_at desc);
create index events_case on case_events(case_id,created_at desc);
create index tokens_user on device_tokens(user_id,is_active);
create index notifications_recipient on notifications(recipient_id,created_at desc);
create index outbox_due on notification_outbox(status,next_attempt_at);
create index audit_barangay on audit_logs(barangay_id,created_at desc);
-- Fail closed: all application tables are private until reviewed policies and API contracts are added.
do $$ declare t record; begin
 for t in select tablename from pg_catalog.pg_tables where schemaname='qralalay' loop
  execute format('alter table qralalay.%I enable row level security',t.tablename);
 end loop;
end $$;
revoke all on all tables in schema qralalay from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema qralalay to service_role;
commit;
