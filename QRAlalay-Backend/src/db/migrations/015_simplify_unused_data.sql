-- Keep only data the app uses. Everything removed here was written but
-- never read or shown, and much of it was personal data (IP addresses,
-- browser details, contact numbers) better not kept at all. Existing values
-- were exported to db-backups/before-015-simplify.json first.
--
--   scan_events                     log of every scan; the incident already
--                                   records where it was scanned and how
--                                   many people reported it
--   audit_logs.ip_address           never shown
--   refresh_tokens.user_agent,      never shown; a session is identified by
--     ip_address, last_active_at    user + device
--   otp_codes.requester_ip          never read (the request rate limit
--                                   uses otp_request_log)
--   otp_codes.max_attempts          always the OTP_MAX_VERIFY_ATTEMPTS setting
--   qr_tokens.error_correction      always the QR_LEVEL_Q_ERROR_CORRECTION setting
--   residents.sex, landmark_notes,  not collected or shown by the app;
--     emergency_contacts            contacts are the guardian and responder
--                                   accounts, and the public QR page no
--                                   longer sends phone numbers to whoever scans
--
-- Standard SQL (ISO/IEC 9075-2): DROP TABLE / DROP COLUMN with RESTRICT,
-- one action per ALTER TABLE.

DROP TABLE scan_events RESTRICT;

ALTER TABLE audit_logs DROP COLUMN ip_address RESTRICT;

ALTER TABLE refresh_tokens DROP COLUMN user_agent RESTRICT;
ALTER TABLE refresh_tokens DROP COLUMN ip_address RESTRICT;
ALTER TABLE refresh_tokens DROP COLUMN last_active_at RESTRICT;

-- The attempts rule referred to max_attempts; the limit now lives in the app.
ALTER TABLE otp_codes DROP CONSTRAINT ck_otp_codes_attempts;
ALTER TABLE otp_codes DROP COLUMN requester_ip RESTRICT;
ALTER TABLE otp_codes DROP COLUMN max_attempts RESTRICT;
ALTER TABLE otp_codes ADD CONSTRAINT ck_otp_codes_attempts CHECK (attempts >= 0);

ALTER TABLE qr_tokens DROP CONSTRAINT ck_qr_tokens_error_correction;
ALTER TABLE qr_tokens DROP COLUMN error_correction RESTRICT;

ALTER TABLE residents DROP COLUMN sex RESTRICT;
ALTER TABLE residents DROP COLUMN landmark_notes RESTRICT;
ALTER TABLE residents DROP COLUMN emergency_contacts RESTRICT;
