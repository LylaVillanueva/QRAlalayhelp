-- Normalise the incidents table. It had grown to 45 columns covering six
-- different topics. Each topic now has its own table, linked one-to-one by
-- incident_id, and a row only exists once that topic actually applies:
--
--   incidents                   the alert itself: who, where, status, timing
--   incident_responses          responder assignment, reminders, report
--   incident_guardian_followups guardian reminder / marked unreachable
--   incident_outcomes           resolved and closed (who and when)
--   incident_cancellations      the bystander's cancel window and its use
--   incident_location_shares    (existing) now also holds each bystander's
--                               live position, instead of copying the
--                               latest one onto the incident
--
-- The view incident_details joins them back into one row per incident with
-- the original column names. The backend reads through it, so the API
-- response (and the app) is unchanged, and it is the easy place to read an
-- incident in full. Bystander credentials (cancel_token) are deliberately
-- left out of the view.
--
-- Standard SQL (ISO/IEC 9075-2) throughout, except the one CREATE INDEX
-- (indexes are outside the standard; see docs/SQL_CONFORMANCE.md).

-- 1. Topic tables ----------------------------------------------------------

CREATE TABLE incident_responses (
  incident_id          UUID NOT NULL,
  responder_id         UUID NOT NULL,
  assigned_by          UUID NOT NULL,
  assigned_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reminded_at          TIMESTAMP WITH TIME ZONE,
  unreachable_at       TIMESTAMP WITH TIME ZONE,
  unreachable_reason   CHARACTER VARYING(500),
  report_submitted_by  UUID,
  report_submitted_at  TIMESTAMP WITH TIME ZONE,
  final_action_summary CHARACTER VARYING(2000),
  CONSTRAINT pk_incident_responses PRIMARY KEY (incident_id),
  CONSTRAINT fk_incident_responses_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_responses_responder FOREIGN KEY (responder_id) REFERENCES users (id),
  CONSTRAINT fk_incident_responses_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id),
  CONSTRAINT fk_incident_responses_report_by FOREIGN KEY (report_submitted_by) REFERENCES users (id)
);

CREATE TABLE incident_guardian_followups (
  incident_id        UUID NOT NULL,
  reminded_at        TIMESTAMP WITH TIME ZONE,
  unreachable_at     TIMESTAMP WITH TIME ZONE,
  unreachable_by     UUID,  -- NULL with unreachable_at set = marked automatically after the grace period
  unreachable_reason CHARACTER VARYING(500),
  CONSTRAINT pk_incident_guardian_followups PRIMARY KEY (incident_id),
  CONSTRAINT fk_incident_guardian_followups_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_guardian_followups_by FOREIGN KEY (unreachable_by) REFERENCES users (id)
);

CREATE TABLE incident_outcomes (
  incident_id UUID NOT NULL,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  closed_by   UUID,
  closed_at   TIMESTAMP WITH TIME ZONE,
  CONSTRAINT pk_incident_outcomes PRIMARY KEY (incident_id),
  CONSTRAINT fk_incident_outcomes_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_outcomes_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id),
  CONSTRAINT fk_incident_outcomes_closed_by FOREIGN KEY (closed_by) REFERENCES users (id)
);

CREATE TABLE incident_cancellations (
  incident_id       UUID NOT NULL,
  cancel_token      CHARACTER VARYING(64),  -- cleared once used
  cancellable_until TIMESTAMP WITH TIME ZONE,
  cancelled_at      TIMESTAMP WITH TIME ZONE,
  cancelled_reason  CHARACTER VARYING(100),
  CONSTRAINT pk_incident_cancellations PRIMARY KEY (incident_id),
  CONSTRAINT fk_incident_cancellations_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
  CONSTRAINT uq_incident_cancellations_token UNIQUE (cancel_token)
);

ALTER TABLE incident_location_shares ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE incident_location_shares ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE incident_location_shares ADD COLUMN address CHARACTER VARYING(500);
ALTER TABLE incident_location_shares ADD COLUMN address_latitude DOUBLE PRECISION;
ALTER TABLE incident_location_shares ADD COLUMN address_longitude DOUBLE PRECISION;
ALTER TABLE incident_location_shares ADD CONSTRAINT ck_incident_location_shares_latitude CHECK (latitude BETWEEN -90 AND 90);
ALTER TABLE incident_location_shares ADD CONSTRAINT ck_incident_location_shares_longitude CHECK (longitude BETWEEN -180 AND 180);

-- 2. Move the existing data -------------------------------------------------

INSERT INTO incident_responses (incident_id, responder_id, assigned_by, assigned_at, reminded_at, unreachable_at,
                                unreachable_reason, report_submitted_by, report_submitted_at, final_action_summary)
SELECT id, assigned_responder_id, assigned_by, assigned_at, responder_reminded_at, responder_unreachable_at,
       responder_unreachable_reason, report_submitted_by, report_submitted_at, final_action_summary
FROM incidents
WHERE assigned_responder_id IS NOT NULL;

INSERT INTO incident_guardian_followups (incident_id, reminded_at, unreachable_at, unreachable_by, unreachable_reason)
SELECT id, guardian_reminded_at, guardian_unreachable_at, guardian_unreachable_by, guardian_unreachable_reason
FROM incidents
WHERE guardian_reminded_at IS NOT NULL OR guardian_unreachable_at IS NOT NULL
   OR guardian_unreachable_by IS NOT NULL OR guardian_unreachable_reason IS NOT NULL;

INSERT INTO incident_outcomes (incident_id, resolved_by, resolved_at, closed_by, closed_at)
SELECT id, resolved_by, resolved_at, closed_by, closed_at
FROM incidents
WHERE resolved_by IS NOT NULL OR resolved_at IS NOT NULL OR closed_by IS NOT NULL OR closed_at IS NOT NULL;

INSERT INTO incident_cancellations (incident_id, cancel_token, cancellable_until, cancelled_at, cancelled_reason)
SELECT id, cancel_token, cancellable_until, cancelled_at, cancelled_reason
FROM incidents
WHERE cancel_token IS NOT NULL OR cancellable_until IS NOT NULL OR cancelled_at IS NOT NULL OR cancelled_reason IS NOT NULL;

-- The incident only kept the latest live position; it belongs to the share
-- that sent it most recently.
UPDATE incident_location_shares
SET latitude = (SELECT i.live_latitude FROM incidents i WHERE i.id = incident_location_shares.incident_id),
    longitude = (SELECT i.live_longitude FROM incidents i WHERE i.id = incident_location_shares.incident_id),
    address = (SELECT i.live_address FROM incidents i WHERE i.id = incident_location_shares.incident_id),
    address_latitude = (SELECT i.live_address_latitude FROM incidents i WHERE i.id = incident_location_shares.incident_id),
    address_longitude = (SELECT i.live_address_longitude FROM incidents i WHERE i.id = incident_location_shares.incident_id)
WHERE token = (SELECT s.token FROM incident_location_shares s
               WHERE s.incident_id = incident_location_shares.incident_id AND s.last_shared_at IS NOT NULL
               ORDER BY s.last_shared_at DESC
               FETCH FIRST 1 ROW ONLY);

-- 3. Remove the moved columns from incidents ---------------------------------

ALTER TABLE incidents DROP CONSTRAINT ck_incidents_live_latitude;
ALTER TABLE incidents DROP CONSTRAINT ck_incidents_live_longitude;
ALTER TABLE incidents DROP CONSTRAINT incidents_cancel_token_key;

ALTER TABLE incidents DROP COLUMN assigned_responder_id RESTRICT;
ALTER TABLE incidents DROP COLUMN assigned_by RESTRICT;
ALTER TABLE incidents DROP COLUMN assigned_at RESTRICT;
ALTER TABLE incidents DROP COLUMN responder_reminded_at RESTRICT;
ALTER TABLE incidents DROP COLUMN responder_unreachable_at RESTRICT;
ALTER TABLE incidents DROP COLUMN responder_unreachable_reason RESTRICT;
ALTER TABLE incidents DROP COLUMN report_submitted_by RESTRICT;
ALTER TABLE incidents DROP COLUMN report_submitted_at RESTRICT;
ALTER TABLE incidents DROP COLUMN final_action_summary RESTRICT;

ALTER TABLE incidents DROP COLUMN guardian_reminded_at RESTRICT;
ALTER TABLE incidents DROP COLUMN guardian_unreachable_at RESTRICT;
ALTER TABLE incidents DROP COLUMN guardian_unreachable_by RESTRICT;
ALTER TABLE incidents DROP COLUMN guardian_unreachable_reason RESTRICT;

ALTER TABLE incidents DROP COLUMN resolved_by RESTRICT;
ALTER TABLE incidents DROP COLUMN resolved_at RESTRICT;
ALTER TABLE incidents DROP COLUMN closed_by RESTRICT;
ALTER TABLE incidents DROP COLUMN closed_at RESTRICT;

ALTER TABLE incidents DROP COLUMN cancel_token RESTRICT;
ALTER TABLE incidents DROP COLUMN cancellable_until RESTRICT;
ALTER TABLE incidents DROP COLUMN cancelled_at RESTRICT;
ALTER TABLE incidents DROP COLUMN cancelled_reason RESTRICT;

ALTER TABLE incidents DROP COLUMN live_latitude RESTRICT;
ALTER TABLE incidents DROP COLUMN live_longitude RESTRICT;
ALTER TABLE incidents DROP COLUMN live_location_updated_at RESTRICT;
ALTER TABLE incidents DROP COLUMN live_location_sharing RESTRICT;
ALTER TABLE incidents DROP COLUMN live_address RESTRICT;
ALTER TABLE incidents DROP COLUMN live_address_latitude RESTRICT;
ALTER TABLE incidents DROP COLUMN live_address_longitude RESTRICT;

-- 4. One row per incident, original column names ------------------------------

CREATE VIEW incident_details AS
SELECT
  i.id, i.resident_id, i.qr_token, i.status, i.bystander_notes,
  i.scan_latitude, i.scan_longitude, i.scan_address,
  i.report_count, i.last_reported_at, i.guardian_required,
  i.timeout_at, i.escalated_at, i.created_at, i.updated_at,
  r.responder_id AS assigned_responder_id,
  r.assigned_by,
  r.assigned_at,
  r.reminded_at AS responder_reminded_at,
  r.unreachable_at AS responder_unreachable_at,
  r.unreachable_reason AS responder_unreachable_reason,
  r.report_submitted_by,
  r.report_submitted_at,
  r.final_action_summary,
  g.reminded_at AS guardian_reminded_at,
  g.unreachable_at AS guardian_unreachable_at,
  g.unreachable_by AS guardian_unreachable_by,
  g.unreachable_reason AS guardian_unreachable_reason,
  o.resolved_by, o.resolved_at, o.closed_by, o.closed_at,
  c.cancellable_until, c.cancelled_at, c.cancelled_reason,
  ls.latitude AS live_latitude,
  ls.longitude AS live_longitude,
  ls.last_shared_at AS live_location_updated_at,
  ls.address AS live_address,
  CASE WHEN EXISTS (SELECT 1 FROM incident_location_shares a
                    WHERE a.incident_id = i.id AND a.stopped_at IS NULL AND a.last_shared_at IS NOT NULL)
       THEN TRUE ELSE FALSE END AS live_location_sharing
FROM incidents i
LEFT JOIN incident_responses r ON r.incident_id = i.id
LEFT JOIN incident_guardian_followups g ON g.incident_id = i.id
LEFT JOIN incident_outcomes o ON o.incident_id = i.id
LEFT JOIN incident_cancellations c ON c.incident_id = i.id
LEFT JOIN LATERAL (
  SELECT s.latitude, s.longitude, s.address, s.last_shared_at
  FROM incident_location_shares s
  WHERE s.incident_id = i.id AND s.latitude IS NOT NULL
  ORDER BY s.last_shared_at DESC
  FETCH FIRST 1 ROW ONLY
) ls ON TRUE;

-- 5. Same lock-down as migration 013 for the new objects ----------------------

REVOKE ALL PRIVILEGES ON incident_responses FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_guardian_followups FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_outcomes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_cancellations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_details FROM anon, authenticated;

-- Implementation-defined (outside the standard): finds a responder's tasks.
CREATE INDEX idx_incident_responses_responder ON incident_responses (responder_id);
