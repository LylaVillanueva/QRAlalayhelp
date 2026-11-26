-- One open alert per resident: a later report (another QR scan, or an app
-- user raising it) joins the open incident and escalates it instead of
-- opening a duplicate. report_count/last_reported_at record that, and
-- throttle the escalation notices so a burst of scans doesn't spam anyone.
--
-- Coordinates are also turned into readable street addresses after the
-- fact (reverse geocoding), so the app can show "1372 España Boulevard,
-- Sampaloc, Manila" instead of raw latitude/longitude. live_address_* keep
-- the point the live address was resolved for, so a bystander who hasn't
-- moved doesn't trigger another lookup.

alter table incidents
  add column report_count integer not null default 1,
  add column last_reported_at timestamptz,
  add column scan_address text,
  add column live_address text,
  add column live_address_latitude double precision,
  add column live_address_longitude double precision;
