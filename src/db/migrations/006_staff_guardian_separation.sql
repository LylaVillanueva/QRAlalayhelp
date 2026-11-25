-- Older staff enrollment stored the staff's own login in guardian_id.
-- Preserve that account association separately; it is not a guardian.
ALTER TABLE residents ADD COLUMN staff_account_id uuid REFERENCES users(id) ON DELETE SET NULL;

INSERT INTO audit_logs (action, entity_type, entity_id, metadata)
SELECT 'incident.invalid_guardian_corrected', 'incident', i.id,
       jsonb_build_object('previousAccountId', r.guardian_id, 'reason', 'Staff account incorrectly stored as guardian')
FROM incidents i JOIN residents r ON r.id=i.resident_id JOIN users u ON u.id=r.guardian_id
WHERE u.role <> 'guardian' AND i.guardian_required = true
  AND i.status NOT IN ('closed','resolved','confirmed_safe');

UPDATE incidents i SET guardian_required=false
FROM residents r JOIN users u ON u.id=r.guardian_id
WHERE i.resident_id=r.id AND u.role <> 'guardian'
  AND i.status NOT IN ('closed','resolved','confirmed_safe');

UPDATE residents r SET staff_account_id=r.guardian_id, guardian_id=null
FROM users u WHERE u.id=r.guardian_id AND u.role <> 'guardian';

CREATE OR REPLACE FUNCTION snapshot_incident_guardian() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT EXISTS(SELECT 1 FROM residents r JOIN users u ON u.id=r.guardian_id
    WHERE r.id=NEW.resident_id AND u.role='guardian') INTO NEW.guardian_required;
  RETURN NEW;
END;
$$;

CREATE FUNCTION validate_resident_guardian() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.guardian_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM users WHERE id=NEW.guardian_id AND role='guardian') THEN
    RAISE EXCEPTION 'Guardian must reference a guardian account' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resident_guardian_role BEFORE INSERT OR UPDATE OF guardian_id ON residents
FOR EACH ROW EXECUTE FUNCTION validate_resident_guardian();
