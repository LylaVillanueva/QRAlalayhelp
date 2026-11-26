-- Bring the schema in line with ISO/IEC 9075 (SQL):
--   Part 2 (SQL/Foundation)  standard data types, defaults and constraints
--   Part 11 (SQL/Schemata)   every allowed value is now a named CHECK
--                            constraint, so INFORMATION_SCHEMA describes the
--                            schema fully (enum types only showed up there
--                            as "USER-DEFINED")
-- See docs/SQL_CONFORMANCE.md for the conformance statement (Part 1) and the
-- deviations that remain, with reasons.
--
-- What changes:
--   * PostgreSQL ENUM types      -> CHARACTER VARYING(n) + CHECK (... IN (...))
--   * text                       -> CHARACTER VARYING(n)
--   * inet                       -> CHARACTER VARYING(45)  (longest IPv6 text form)
--   * citext (users.email)       -> CHARACTER VARYING(254) + lower-case CHECK;
--                                   the app lower-cases emails instead
--   * jsonb                      -> JSON (SQL:2023 JSON data type)
--   * DEFAULT now()              -> DEFAULT CURRENT_TIMESTAMP
--   * partial unique index on incidents.cancel_token -> UNIQUE constraint
--     (standard UNIQUE already treats NULLs as distinct)
-- No data is removed; every limit below is at least the app's own input
-- limit and above the longest value stored when this was written.
--
-- Standard form: one action per ALTER TABLE statement. The only
-- non-standard statements are DROP INDEX / CREATE INDEX at the start and
-- end (indexes are outside the standard): two partial indexes compare
-- against enum literals and must be rebuilt around the type change.

-- 1. Indexes that depend on the enum types (rebuilt in step 8)
DROP INDEX idx_incidents_timeout;
DROP INDEX idx_qr_tokens_active_per_resident;
DROP INDEX idx_incidents_cancel_token;

-- 2. Enumerated columns -> CHARACTER VARYING + named CHECK
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE users ALTER COLUMN role SET DATA TYPE CHARACTER VARYING(30);
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('guardian', 'barangay_official', 'barangay_responder'));

ALTER TABLE audit_logs ALTER COLUMN actor_role DROP DEFAULT;
ALTER TABLE audit_logs ALTER COLUMN actor_role SET DATA TYPE CHARACTER VARYING(30);
ALTER TABLE audit_logs ADD CONSTRAINT ck_audit_logs_actor_role CHECK (actor_role IN ('guardian', 'barangay_official', 'barangay_responder'));

ALTER TABLE incidents ALTER COLUMN status DROP DEFAULT;
ALTER TABLE incidents ALTER COLUMN status SET DATA TYPE CHARACTER VARYING(30);
ALTER TABLE incidents ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_status CHECK (status IN ('active', 'confirmed_safe', 'confirmed_not_safe', 'escalated', 'assigned', 'resolved', 'closed', 'cancelled'));

ALTER TABLE incident_confirmations ALTER COLUMN source DROP DEFAULT;
ALTER TABLE incident_confirmations ALTER COLUMN source SET DATA TYPE CHARACTER VARYING(30);
ALTER TABLE incident_confirmations ADD CONSTRAINT ck_incident_confirmations_source CHECK (source IN ('guardian', 'barangay_responder'));

ALTER TABLE incident_confirmations ALTER COLUMN decision DROP DEFAULT;
ALTER TABLE incident_confirmations ALTER COLUMN decision SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE incident_confirmations ADD CONSTRAINT ck_incident_confirmations_decision CHECK (decision IN ('safe', 'not_safe'));

ALTER TABLE otp_codes ALTER COLUMN channel DROP DEFAULT;
ALTER TABLE otp_codes ALTER COLUMN channel SET DATA TYPE CHARACTER VARYING(10);
ALTER TABLE otp_codes ADD CONSTRAINT ck_otp_codes_channel CHECK (channel IN ('phone', 'email'));

ALTER TABLE otp_codes ALTER COLUMN purpose DROP DEFAULT;
ALTER TABLE otp_codes ALTER COLUMN purpose SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE otp_codes ALTER COLUMN purpose SET DEFAULT 'login';
ALTER TABLE otp_codes ADD CONSTRAINT ck_otp_codes_purpose CHECK (purpose IN ('login', 'signup', 'verify_contact'));

ALTER TABLE qr_tokens ALTER COLUMN status DROP DEFAULT;
ALTER TABLE qr_tokens ALTER COLUMN status SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE qr_tokens ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE qr_tokens ADD CONSTRAINT ck_qr_tokens_status CHECK (status IN ('active', 'revoked', 'reissued'));

-- 3. The enum types are no longer used
DROP TYPE user_role RESTRICT;
DROP TYPE incident_status RESTRICT;
DROP TYPE confirmation_source RESTRICT;
DROP TYPE confirmation_decision RESTRICT;
DROP TYPE auth_channel RESTRICT;
DROP TYPE otp_purpose RESTRICT;
DROP TYPE qr_token_status RESTRICT;

-- 4. Emails are stored lower-case (replaces case-insensitive citext)
UPDATE users SET email = LOWER(email) WHERE email IS NOT NULL;
UPDATE otp_codes SET identifier = LOWER(identifier) WHERE channel = 'email';
UPDATE otp_request_log SET identifier = LOWER(identifier) WHERE identifier LIKE '%@%';

-- 5. text / inet / citext -> CHARACTER VARYING(n)
ALTER TABLE audit_logs ALTER COLUMN action SET DATA TYPE CHARACTER VARYING(100);
ALTER TABLE audit_logs ALTER COLUMN entity_type SET DATA TYPE CHARACTER VARYING(50);
ALTER TABLE audit_logs ALTER COLUMN ip_address SET DATA TYPE CHARACTER VARYING(45);

ALTER TABLE barangays ALTER COLUMN name SET DATA TYPE CHARACTER VARYING(150);
ALTER TABLE barangays ALTER COLUMN municipality SET DATA TYPE CHARACTER VARYING(150);
ALTER TABLE barangays ALTER COLUMN province SET DATA TYPE CHARACTER VARYING(150);

ALTER TABLE incident_confirmations ALTER COLUMN summary_notes SET DATA TYPE CHARACTER VARYING(1000);

ALTER TABLE incident_location_shares ALTER COLUMN token SET DATA TYPE CHARACTER VARYING(64);

ALTER TABLE incidents ALTER COLUMN qr_token SET DATA TYPE CHARACTER VARYING(64);
ALTER TABLE incidents ALTER COLUMN bystander_notes SET DATA TYPE CHARACTER VARYING(10000);
ALTER TABLE incidents ALTER COLUMN final_action_summary SET DATA TYPE CHARACTER VARYING(2000);
ALTER TABLE incidents ALTER COLUMN guardian_unreachable_reason SET DATA TYPE CHARACTER VARYING(500);
ALTER TABLE incidents ALTER COLUMN responder_unreachable_reason SET DATA TYPE CHARACTER VARYING(500);
ALTER TABLE incidents ALTER COLUMN cancel_token SET DATA TYPE CHARACTER VARYING(64);
ALTER TABLE incidents ALTER COLUMN cancelled_reason SET DATA TYPE CHARACTER VARYING(100);
ALTER TABLE incidents ALTER COLUMN scan_address SET DATA TYPE CHARACTER VARYING(500);
ALTER TABLE incidents ALTER COLUMN live_address SET DATA TYPE CHARACTER VARYING(500);

ALTER TABLE otp_codes ALTER COLUMN identifier SET DATA TYPE CHARACTER VARYING(254);
ALTER TABLE otp_codes ALTER COLUMN otp_hash SET DATA TYPE CHARACTER VARYING(255);
ALTER TABLE otp_codes ALTER COLUMN requester_ip SET DATA TYPE CHARACTER VARYING(45);

ALTER TABLE otp_request_log ALTER COLUMN identifier SET DATA TYPE CHARACTER VARYING(254);
ALTER TABLE otp_request_log ALTER COLUMN requester_ip SET DATA TYPE CHARACTER VARYING(45);

ALTER TABLE push_tokens ALTER COLUMN device_id SET DATA TYPE CHARACTER VARYING(255);
ALTER TABLE push_tokens ALTER COLUMN push_token SET DATA TYPE CHARACTER VARYING(255);
ALTER TABLE push_tokens ALTER COLUMN platform SET DATA TYPE CHARACTER VARYING(20);

ALTER TABLE qr_tokens ALTER COLUMN token SET DATA TYPE CHARACTER VARYING(64);

ALTER TABLE refresh_tokens ALTER COLUMN token_hash SET DATA TYPE CHARACTER VARYING(128);
ALTER TABLE refresh_tokens ALTER COLUMN device_id SET DATA TYPE CHARACTER VARYING(255);
ALTER TABLE refresh_tokens ALTER COLUMN platform SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE refresh_tokens ALTER COLUMN user_agent SET DATA TYPE CHARACTER VARYING(512);
ALTER TABLE refresh_tokens ALTER COLUMN ip_address SET DATA TYPE CHARACTER VARYING(45);

ALTER TABLE residents ALTER COLUMN full_name SET DATA TYPE CHARACTER VARYING(150);
ALTER TABLE residents ALTER COLUMN sex SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE residents ALTER COLUMN medical_notes SET DATA TYPE CHARACTER VARYING(2000);
ALTER TABLE residents ALTER COLUMN home_address SET DATA TYPE CHARACTER VARYING(300);
ALTER TABLE residents ALTER COLUMN landmark_notes SET DATA TYPE CHARACTER VARYING(500);
ALTER TABLE residents ALTER COLUMN resident_type SET DATA TYPE CHARACTER VARYING(50);
ALTER TABLE residents ALTER COLUMN resident_code SET DATA TYPE CHARACTER VARYING(50);
ALTER TABLE residents ALTER COLUMN guardian_relationship SET DATA TYPE CHARACTER VARYING(100);

ALTER TABLE scan_events ALTER COLUMN qr_token SET DATA TYPE CHARACTER VARYING(64);
ALTER TABLE scan_events ALTER COLUMN ip_address SET DATA TYPE CHARACTER VARYING(45);
ALTER TABLE scan_events ALTER COLUMN user_agent SET DATA TYPE CHARACTER VARYING(512);

ALTER TABLE users ALTER COLUMN full_name SET DATA TYPE CHARACTER VARYING(150);
ALTER TABLE users ALTER COLUMN phone_number SET DATA TYPE CHARACTER VARYING(20);
ALTER TABLE users ALTER COLUMN email SET DATA TYPE CHARACTER VARYING(254);
ALTER TABLE users ALTER COLUMN position SET DATA TYPE CHARACTER VARYING(100);
ALTER TABLE users ALTER COLUMN home_address SET DATA TYPE CHARACTER VARYING(300);

-- inet converts to its CIDR text form (e.g. '203.0.113.5/32'); keep just the address
UPDATE audit_logs SET ip_address = SUBSTRING(ip_address FROM 1 FOR POSITION('/' IN ip_address) - 1) WHERE ip_address LIKE '%/%';
UPDATE otp_codes SET requester_ip = SUBSTRING(requester_ip FROM 1 FOR POSITION('/' IN requester_ip) - 1) WHERE requester_ip LIKE '%/%';
UPDATE otp_request_log SET requester_ip = SUBSTRING(requester_ip FROM 1 FOR POSITION('/' IN requester_ip) - 1) WHERE requester_ip LIKE '%/%';
UPDATE refresh_tokens SET ip_address = SUBSTRING(ip_address FROM 1 FOR POSITION('/' IN ip_address) - 1) WHERE ip_address LIKE '%/%';
UPDATE scan_events SET ip_address = SUBSTRING(ip_address FROM 1 FOR POSITION('/' IN ip_address) - 1) WHERE ip_address LIKE '%/%';

ALTER TABLE qr_tokens ALTER COLUMN error_correction DROP DEFAULT;
ALTER TABLE qr_tokens ALTER COLUMN error_correction SET DATA TYPE CHARACTER(1);
ALTER TABLE qr_tokens ALTER COLUMN error_correction SET DEFAULT 'Q';

-- 6. jsonb -> JSON
ALTER TABLE audit_logs ALTER COLUMN metadata DROP DEFAULT;
ALTER TABLE audit_logs ALTER COLUMN metadata SET DATA TYPE JSON;
ALTER TABLE audit_logs ALTER COLUMN metadata SET DEFAULT '{}';
ALTER TABLE residents ALTER COLUMN emergency_contacts DROP DEFAULT;
ALTER TABLE residents ALTER COLUMN emergency_contacts SET DATA TYPE JSON;
ALTER TABLE residents ALTER COLUMN emergency_contacts SET DEFAULT '[]';

-- 7. Standard datetime defaults and integrity rules
ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE barangays ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incident_confirmations ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incident_location_shares ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incidents ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE incidents ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE otp_codes ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE otp_request_log ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE push_tokens ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE push_tokens ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE qr_tokens ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE refresh_tokens ALTER COLUMN last_active_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE refresh_tokens ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE residents ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE residents ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE scan_events ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE incidents ADD CONSTRAINT incidents_cancel_token_key UNIQUE (cancel_token);
ALTER TABLE qr_tokens ADD CONSTRAINT ck_qr_tokens_error_correction CHECK (error_correction IN ('L', 'M', 'Q', 'H'));
ALTER TABLE users ADD CONSTRAINT ck_users_email_lowercase CHECK (email = LOWER(email));
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_report_count CHECK (report_count >= 1);
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_scan_latitude CHECK (scan_latitude BETWEEN -90 AND 90);
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_scan_longitude CHECK (scan_longitude BETWEEN -180 AND 180);
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_live_latitude CHECK (live_latitude BETWEEN -90 AND 90);
ALTER TABLE incidents ADD CONSTRAINT ck_incidents_live_longitude CHECK (live_longitude BETWEEN -180 AND 180);
ALTER TABLE scan_events ADD CONSTRAINT ck_scan_events_latitude CHECK (scan_latitude BETWEEN -90 AND 90);
ALTER TABLE scan_events ADD CONSTRAINT ck_scan_events_longitude CHECK (scan_longitude BETWEEN -180 AND 180);
ALTER TABLE otp_codes ADD CONSTRAINT ck_otp_codes_attempts CHECK (attempts BETWEEN 0 AND max_attempts);

-- 8. Rebuild the partial indexes (implementation-defined; see conformance doc)
CREATE INDEX idx_incidents_timeout ON incidents (timeout_at) WHERE status = 'active';
CREATE UNIQUE INDEX idx_qr_tokens_active_per_resident ON qr_tokens (resident_id) WHERE status = 'active';
