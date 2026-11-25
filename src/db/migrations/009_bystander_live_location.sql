-- A bystander can keep sharing their location after raising an alert, and
-- stop whenever they choose. Each scanner gets their own share token, kept
-- in a separate table so it never rides along on the incident row that is
-- broadcast to guardians and barangay staff. The incident row only carries
-- the latest position, which is what responders' map buttons read.

create table incident_location_shares (
  token            text primary key,
  incident_id      uuid not null references incidents(id) on delete cascade,
  created_at       timestamptz not null default now(),
  last_shared_at   timestamptz,
  stopped_at       timestamptz
);

create index idx_location_shares_incident on incident_location_shares(incident_id);

alter table incidents
  add column live_latitude double precision,
  add column live_longitude double precision,
  add column live_location_updated_at timestamptz,
  add column live_location_sharing boolean not null default false;
