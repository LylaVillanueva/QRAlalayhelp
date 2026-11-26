-- Profile photos for residents and user accounts. The image files live in
-- a private Supabase Storage bucket ("profile-photos"); the database only
-- keeps where each one is, and the app is given short-lived signed links.
--
-- Standard SQL (ISO/IEC 9075-2).

ALTER TABLE residents ADD COLUMN photo_path CHARACTER VARYING(300);
ALTER TABLE users ADD COLUMN photo_path CHARACTER VARYING(300);
