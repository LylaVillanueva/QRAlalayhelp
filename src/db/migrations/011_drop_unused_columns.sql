-- Remove columns nothing reads or writes, so the tables only hold what the
-- app actually uses. Values that existed were exported to
-- db-backups/before-011-dropped-columns.json before this ran.
--
--   residents.photo_url              never collected
--   residents.staff_account_id       leftover from migration 006's one-off
--                                    data fix; who enrolled a resident is
--                                    already recorded in enrolled_by
--   qr_tokens.printed_at             printing was never tracked
--   qr_tokens.print_ready_asset_url  printing was never tracked
--   refresh_tokens.replaced_by_id    token rotation never recorded it
--   incidents.assigned_coordinates   copy of scan_latitude/scan_longitude
--   incidents.scan_landmark_notes    no client sends it; scan_address
--                                    (reverse geocoded) replaced it
--
-- Standard SQL (ISO/IEC 9075-2, Foundation): foreign keys are dropped by
-- name first, then each column with RESTRICT, so the migration fails
-- instead of cascading into anything that still depends on a column.

ALTER TABLE residents DROP CONSTRAINT residents_staff_account_id_fkey;
ALTER TABLE residents DROP COLUMN staff_account_id RESTRICT;
ALTER TABLE residents DROP COLUMN photo_url RESTRICT;

ALTER TABLE qr_tokens DROP COLUMN printed_at RESTRICT;
ALTER TABLE qr_tokens DROP COLUMN print_ready_asset_url RESTRICT;

ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_replaced_by_id_fkey;
ALTER TABLE refresh_tokens DROP COLUMN replaced_by_id RESTRICT;

ALTER TABLE incidents DROP COLUMN assigned_coordinates RESTRICT;
ALTER TABLE incidents DROP COLUMN scan_landmark_notes RESTRICT;
