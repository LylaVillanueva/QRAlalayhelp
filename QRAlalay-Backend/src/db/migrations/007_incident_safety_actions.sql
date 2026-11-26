-- Accountable alternatives to silent timeouts: a guardian or a responder
-- can be explicitly marked unreachable (by an official, the assigned
-- responder, or the system after a grace period) rather than an incident
-- just quietly stalling. A bystander who tapped by accident can cancel
-- within a short window instead of triggering a full response for nothing.
-- One-time reminder timestamps stop the timeout engine from re-pinging the
-- same person every 30 seconds.

alter type incident_status add value if not exists 'cancelled';

alter table incidents
  add column guardian_unreachable_at timestamptz,
  add column guardian_unreachable_by uuid references users(id), -- null = system-marked after the grace period, not a person's claim
  add column guardian_unreachable_reason text,
  add column responder_unreachable_at timestamptz,
  add column responder_unreachable_reason text,
  add column cancel_token text,
  add column cancellable_until timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_reason text,
  add column guardian_reminded_at timestamptz,
  add column responder_reminded_at timestamptz;

create unique index idx_incidents_cancel_token on incidents(cancel_token) where cancel_token is not null;
