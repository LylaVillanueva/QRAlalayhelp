-- =====================================================================
-- ResQR — Initial Schema
-- Target: PostgreSQL 15+ (Supabase)
-- Maps directly to the context diagram / DFD / use-case diagram:
--   Actors: bystander (anonymous), guardian, barangay_official,
--           barangay_responder
--   Stores: RESIDENTS, PROFILES, ALERT, CONFIRMATIONS (+ audit logs)
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive email

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type user_role as enum (
  'guardian',
  'barangay_official',
  'barangay_responder'
);

create type auth_channel as enum ('phone', 'email');

create type otp_purpose as enum ('login', 'signup', 'verify_contact');

create type qr_token_status as enum ('active', 'revoked', 'reissued');

create type incident_status as enum (
  'active',            -- [7] alert created, awaiting confirmation
  'confirmed_safe',     -- [9A]/[9B] guardian or responder marked safe
  'confirmed_not_safe',  -- [9A]/[9B] marked not safe -> stays open for responder
  'escalated',          -- auto-escalated by timeout engine
  'assigned',           -- [8C] responder assigned + coordinates sent
  'resolved',            -- [14] responder final action summary submitted
  'closed'               -- [10] barangay official closes the incident
);

create type confirmation_decision as enum ('safe', 'not_safe');

create type confirmation_source as enum ('guardian', 'barangay_responder');

-- ---------------------------------------------------------------------
-- USERS  (guardians, barangay officials, barangay responders only —
-- bystanders never register; they interact anonymously via [8]-[9] flow)
-- ---------------------------------------------------------------------
create table users (
  id                uuid primary key default gen_random_uuid(),
  role              user_role not null,
  full_name         text not null,
  phone_number      text unique,
  email             citext unique,
  is_active         boolean not null default true,
  barangay_id       uuid,                       -- FK added below (self-ref jurisdiction)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint users_identifier_present check (phone_number is not null or email is not null)
);

create table barangays (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  municipality  text not null,
  province      text not null,
  created_at    timestamptz not null default now()
);

alter table users
  add constraint users_barangay_fk foreign key (barangay_id) references barangays(id);

create index idx_users_role on users(role);
create index idx_users_barangay on users(barangay_id);

-- ---------------------------------------------------------------------
-- OTP CODES  — [1] Authenticates (OTP) for all registered roles
-- ---------------------------------------------------------------------
create table otp_codes (
  id                uuid primary key default gen_random_uuid(),
  identifier        text not null,             -- raw phone or email, pre-account lookup
  channel           auth_channel not null,
  purpose           otp_purpose not null default 'login',
  otp_hash          text not null,             -- bcrypt hash, never store plaintext
  expires_at        timestamptz not null,
  attempts          int not null default 0,
  max_attempts      int not null default 5,
  consumed_at       timestamptz,
  requester_ip      inet,
  created_at        timestamptz not null default now()
);

create index idx_otp_identifier on otp_codes(identifier, channel);
create index idx_otp_expires on otp_codes(expires_at);

-- Rate-limiting ledger: max N requests / window per identifier or IP
create table otp_request_log (
  id            uuid primary key default gen_random_uuid(),
  identifier    text not null,
  requester_ip  inet,
  created_at    timestamptz not null default now()
);
create index idx_otp_req_log_identifier_time on otp_request_log(identifier, created_at);
create index idx_otp_req_log_ip_time on otp_request_log(requester_ip, created_at);

-- ---------------------------------------------------------------------
-- REFRESH TOKENS — persistent, per-device mobile sessions ([1] Authenticates)
-- ---------------------------------------------------------------------
create table refresh_tokens (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  token_hash        text not null,             -- sha256 hash of the raw refresh token
  device_id         text not null,
  platform          text not null,             -- 'ios' | 'android' | 'web'
  user_agent        text,
  ip_address        inet,
  last_active_at    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  replaced_by_id    uuid references refresh_tokens(id)
);

create unique index idx_refresh_tokens_user_device on refresh_tokens(user_id, device_id)
  where revoked_at is null;
create index idx_refresh_tokens_hash on refresh_tokens(token_hash);

-- ---------------------------------------------------------------------
-- RESIDENTS (PROFILES store)  — [2] Resident Enrolment Profile Data
-- The QR-wearer. Enrolled by a barangay_official, optionally linked to
-- a guardian account. Residents themselves do not log in.
-- ---------------------------------------------------------------------
create table residents (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  date_of_birth       date,
  sex                 text,
  medical_notes       text,
  home_address        text,                     -- PII — never exposed on public QR view
  landmark_notes      text,
  photo_url           text,
  guardian_id         uuid references users(id) on delete set null,
  enrolled_by         uuid not null references users(id),   -- barangay_official
  barangay_id         uuid not null references barangays(id),
  emergency_contacts  jsonb not null default '[]'::jsonb,   -- [{name, relation, phone}]
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_residents_guardian on residents(guardian_id);
create index idx_residents_barangay on residents(barangay_id);

-- ---------------------------------------------------------------------
-- QR TOKENS  — [3] Real-Time Generated QR Code & Printing Token
-- ---------------------------------------------------------------------
create table qr_tokens (
  token             text primary key,          -- cryptographically random, URL-safe
  resident_id       uuid not null references residents(id) on delete cascade,
  status            qr_token_status not null default 'active',
  error_correction  text not null default 'Q', -- "Level Q Standard" per DFD [4]
  printed_at        timestamptz,
  print_ready_asset_url text,
  issued_by         uuid not null references users(id),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz
);

create index idx_qr_tokens_resident on qr_tokens(resident_id);
create unique index idx_qr_tokens_active_per_resident on qr_tokens(resident_id)
  where status = 'active';

-- ---------------------------------------------------------------------
-- ALERT store — the full incident lifecycle
-- [7] Generate Alert & Saves Location/Notes
-- [8A]/[8B]/[8C] notify guardian, display on console, assign responder
-- [9A]/[9B] confirmations recorded separately in CONFIRMATIONS
-- [10] Update Incident State (closed / escalated)
-- [13]/[14] responder decision + final summary
-- ---------------------------------------------------------------------
create table incidents (
  id                    uuid primary key default gen_random_uuid(),
  resident_id           uuid not null references residents(id),
  qr_token              text references qr_tokens(token),
  status                incident_status not null default 'active',

  -- [10] Incident Report Packet (Scanned Geolocation & Landmark Notes)
  scan_latitude         double precision,
  scan_longitude         double precision,
  scan_landmark_notes    text,
  bystander_notes        text,

  -- assignment ([12] Assigned Emergency Task)
  assigned_responder_id  uuid references users(id),
  assigned_by            uuid references users(id),
  assigned_coordinates   jsonb,                  -- {lat, lng} sent to responder
  assigned_at            timestamptz,

  -- final resolution ([14] Synchronous Safety Decision & Final Action Summary)
  final_action_summary   text,
  resolved_by            uuid references users(id),
  resolved_at            timestamptz,

  -- lifecycle control
  timeout_at              timestamptz,           -- Automated Timeout Engine deadline
  escalated_at             timestamptz,
  closed_by                uuid references users(id),
  closed_at                 timestamptz,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_incidents_resident on incidents(resident_id);
create index idx_incidents_status on incidents(status);
create index idx_incidents_timeout on incidents(timeout_at) where status = 'active';
create index idx_incidents_responder on incidents(assigned_responder_id);

-- ---------------------------------------------------------------------
-- CONFIRMATIONS store — [9A] Guardian Safe/Not-Safe, [9B] Responder decision
-- ---------------------------------------------------------------------
create table incident_confirmations (
  id              uuid primary key default gen_random_uuid(),
  incident_id     uuid not null references incidents(id) on delete cascade,
  source          confirmation_source not null,
  submitted_by    uuid not null references users(id),
  decision        confirmation_decision not null,
  summary_notes   text,
  created_at      timestamptz not null default now()
);

create index idx_confirmations_incident on incident_confirmations(incident_id);

-- ---------------------------------------------------------------------
-- SCAN EVENTS — [8] Physical QR Scan Request (Silent System Initialization)
-- Every scan of a resident's QR is logged, whether or not it becomes an alert.
-- ---------------------------------------------------------------------
create table scan_events (
  id                uuid primary key default gen_random_uuid(),
  qr_token          text not null references qr_tokens(token),
  resident_id       uuid not null references residents(id),
  incident_id       uuid references incidents(id),
  scan_latitude     double precision,
  scan_longitude    double precision,
  ip_address        inet,
  user_agent        text,
  created_at        timestamptz not null default now()
);

create index idx_scan_events_qr on scan_events(qr_token);
create index idx_scan_events_incident on scan_events(incident_id);

-- ---------------------------------------------------------------------
-- PUSH TOKENS — device-registered on login, used for [8A] Dynamic Push
-- Notifications to guardians and [11] Real-Time Emergency Push Alerts.
-- ---------------------------------------------------------------------
create table push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  device_id     text not null,
  push_token    text not null,
  platform      text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, device_id)
);

-- ---------------------------------------------------------------------
-- AUDIT LOGS — [5] Incident Lifecycle History & System Audit Logs
-- ---------------------------------------------------------------------
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references users(id),
  actor_role    user_role,
  action        text not null,                -- e.g. 'incident.status_changed'
  entity_type   text not null,                -- 'incident' | 'resident' | 'qr_token' | 'user'
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index idx_audit_logs_actor on audit_logs(actor_id);
create index idx_audit_logs_created on audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();
create trigger trg_residents_updated_at before update on residents
  for each row execute function set_updated_at();
create trigger trg_incidents_updated_at before update on incidents
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security — enabled but policies are intentionally minimal.
-- Business authorization is enforced primarily in the Node.js API layer
-- (see src/middlewares/rbac.ts) using the Supabase service-role key,
-- which bypasses RLS. RLS here is a defense-in-depth backstop in case a
-- client ever queries Supabase directly with an anon/user key.
-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table residents enable row level security;
alter table incidents enable row level security;
alter table incident_confirmations enable row level security;
alter table qr_tokens enable row level security;
alter table scan_events enable row level security;
alter table audit_logs enable row level security;

-- Deny-all by default (no policies defined) — all access goes through the API.
