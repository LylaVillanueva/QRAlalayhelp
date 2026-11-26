-- Supabase grants its public API roles (anon = anyone holding the public
-- key shipped inside the mobile app, authenticated = any Supabase Auth
-- session) full access to every table in the public schema. Seven tables
-- had no row-level security, so OTP codes, refresh-token hashes, push
-- tokens and live-location tokens could be read or deleted straight through
-- the Supabase REST API, bypassing the backend.
--
-- Nothing uses that route: the mobile app only uses Supabase for its auth
-- session, and all data goes through the ResQR backend, which connects as
-- the database owner. So the public roles get no table privileges at all.
--
-- Standard SQL (ISO/IEC 9075-2, <revoke statement>).

REVOKE ALL PRIVILEGES ON audit_logs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON barangays FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_confirmations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incident_location_shares FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON incidents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON otp_codes FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON otp_request_log FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON push_tokens FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON qr_tokens FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON refresh_tokens FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON residents FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON scan_events FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON schema_migrations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON users FROM anon, authenticated;
