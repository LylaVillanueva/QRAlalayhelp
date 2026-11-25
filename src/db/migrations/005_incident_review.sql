-- Capture the requirement at creation; unlinking a guardian must not waive it.
ALTER TABLE incidents ADD COLUMN guardian_required boolean;
UPDATE incidents i SET guardian_required = (r.guardian_id IS NOT NULL)
FROM residents r WHERE r.id = i.resident_id;
ALTER TABLE incidents ALTER COLUMN guardian_required SET NOT NULL;
ALTER TABLE incidents ALTER COLUMN guardian_required SET DEFAULT true;
ALTER TABLE incidents ADD COLUMN report_submitted_by uuid REFERENCES users(id);
ALTER TABLE incidents ADD COLUMN report_submitted_at timestamptz;
CREATE FUNCTION snapshot_incident_guardian() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT guardian_id IS NOT NULL INTO NEW.guardian_required FROM residents WHERE id = NEW.resident_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER incident_guardian_snapshot BEFORE INSERT ON incidents
FOR EACH ROW EXECUTE FUNCTION snapshot_incident_guardian();
