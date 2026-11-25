-- Additive target foundation for the v3.0 Supabase architecture.
-- Legacy tables and the Express API are retained during staged migration.
-- This migration creates no accounts and contains no resident seed data.

CREATE SCHEMA IF NOT EXISTS app_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated, service_role;

-- Existing barangay rows remain authoritative and keep their identifiers.
ALTER TABLE public.barangays
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Supabase Auth owns credentials and sessions. Application role is stored only
-- in this protected profile row and is never accepted from client metadata.
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  barangay_id UUID NOT NULL REFERENCES public.barangays (id) ON DELETE RESTRICT,
  full_name CHARACTER VARYING(150) NOT NULL,
  role CHARACTER VARYING(30) NOT NULL,
  phone CHARACTER VARYING(32),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_profiles_role CHECK (role IN ('barangay_official', 'guardian', 'barangay_responder', 'resident')),
  CONSTRAINT ck_profiles_full_name CHECK (length(btrim(full_name)) BETWEEN 1 AND 150),
  CONSTRAINT ck_profiles_phone CHECK (phone IS NULL OR length(btrim(phone)) BETWEEN 7 AND 32)
);

-- Public contact fields are the only direct anonymous read path. Verification
-- and operational fields are withheld with column-level privileges.
CREATE TABLE public.barangay_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay_id UUID NOT NULL REFERENCES public.barangays (id) ON DELETE RESTRICT,
  label CHARACTER VARYING(80) NOT NULL,
  phone_number CHARACTER VARYING(32) NOT NULL,
  availability CHARACTER VARYING(160),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  verified_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_barangay_contacts_label CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  CONSTRAINT ck_barangay_contacts_phone CHECK (length(btrim(phone_number)) BETWEEN 7 AND 32),
  CONSTRAINT ck_barangay_contacts_verification CHECK (
    (verified_by IS NULL AND verified_at IS NULL)
    OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

-- Add target-safe public display fields without removing the current resident
-- schema. `is_active` remains the canonical active/archive flag in this phase.
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS display_name CHARACTER VARYING(100),
  ADD COLUMN IF NOT EXISTS assistance_instructions CHARACTER VARYING(500),
  ADD COLUMN IF NOT EXISTS public_disclosure_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resident_profile_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE TABLE public.guardian_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents (id) ON DELETE RESTRICT,
  guardian_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  relationship CHARACTER VARYING(100) NOT NULL,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending',
  verified_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  verified_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_guardian_links_status CHECK (status IN ('pending', 'verified', 'revoked')),
  CONSTRAINT ck_guardian_links_role CHECK (length(btrim(relationship)) BETWEEN 1 AND 100),
  CONSTRAINT ck_guardian_links_verified_fields CHECK (
    (status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
  ),
  CONSTRAINT ck_guardian_links_revoked_fields CHECK (
    (status <> 'revoked' OR revoked_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_guardian_links_active_pair
  ON public.guardian_links (resident_id, guardian_id)
  WHERE status IN ('pending', 'verified');
CREATE INDEX idx_guardian_links_guardian_verified
  ON public.guardian_links (guardian_id, resident_id)
  WHERE status = 'verified';

CREATE TABLE public.qr_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents (id) ON DELETE RESTRICT,
  token_hash BYTEA NOT NULL UNIQUE,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'active',
  issued_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  legacy_issuer_user_id UUID,
  legacy_source BOOLEAN NOT NULL DEFAULT FALSE,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ck_qr_cards_token_hash CHECK (octet_length(token_hash) = 32),
  CONSTRAINT ck_qr_cards_status CHECK (status IN ('active', 'revoked')),
  CONSTRAINT ck_qr_cards_issuer CHECK (legacy_source OR issued_by IS NOT NULL),
  CONSTRAINT ck_qr_cards_revoked_at CHECK ((status = 'active' AND revoked_at IS NULL) OR status = 'revoked')
);
CREATE UNIQUE INDEX uq_qr_cards_active_resident
  ON public.qr_cards (resident_id)
  WHERE status = 'active';

-- Preserve existing printed QR links by hashing legacy tokens into the new
-- digest-only table. Raw tokens remain only in the untouched legacy table
-- until an approved cutover and retirement of the Express API.
INSERT INTO public.qr_cards (
  resident_id, token_hash, status, legacy_issuer_user_id, legacy_source, issued_at, revoked_at
)
SELECT
  qt.resident_id,
  extensions.digest(convert_to(qt.token, 'UTF8'), 'sha256'),
  CASE WHEN qt.status = 'active' THEN 'active' ELSE 'revoked' END,
  qt.issued_by,
  TRUE,
  qt.created_at,
  qt.revoked_at
FROM public.qr_tokens AS qt
ON CONFLICT (token_hash) DO NOTHING;

CREATE TABLE public.assistance_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents (id) ON DELETE RESTRICT,
  barangay_id UUID NOT NULL REFERENCES public.barangays (id) ON DELETE RESTRICT,
  qr_card_id UUID REFERENCES public.qr_cards (id) ON DELETE SET NULL,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'new',
  public_note CHARACTER VARYING(1000),
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  accuracy_meters NUMERIC(8, 2),
  location_description CHARACTER VARYING(300),
  location_captured_at TIMESTAMP WITH TIME ZONE,
  idempotency_key UUID NOT NULL UNIQUE,
  request_token_hash BYTEA,
  acknowledged_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ck_assistance_cases_status CHECK (status IN ('new', 'in_progress', 'escalated', 'closed')),
  CONSTRAINT ck_assistance_cases_note CHECK (public_note IS NULL OR length(public_note) <= 1000),
  CONSTRAINT ck_assistance_cases_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT ck_assistance_cases_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_assistance_cases_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_assistance_cases_accuracy CHECK (accuracy_meters IS NULL OR accuracy_meters >= 0),
  CONSTRAINT ck_assistance_cases_location_time CHECK (latitude IS NULL OR location_captured_at IS NOT NULL),
  CONSTRAINT ck_assistance_cases_request_token CHECK (request_token_hash IS NULL OR octet_length(request_token_hash) = 32),
  CONSTRAINT ck_assistance_cases_version CHECK (version >= 1),
  CONSTRAINT ck_assistance_cases_closed_time CHECK (status <> 'closed' OR closed_at IS NOT NULL),
  CONSTRAINT ck_assistance_cases_ack_fields CHECK ((acknowledged_by IS NULL) = (acknowledged_at IS NULL))
);
CREATE INDEX idx_assistance_cases_barangay_status_created
  ON public.assistance_cases (barangay_id, status, created_at DESC);
CREATE INDEX idx_assistance_cases_resident_created
  ON public.assistance_cases (resident_id, created_at DESC);

CREATE TABLE public.case_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  responder_id UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  legacy_responder_user_id UUID,
  legacy_assigned_by_user_id UUID,
  status CHARACTER VARYING(24) NOT NULL DEFAULT 'pending_acceptance',
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  end_reason CHARACTER VARYING(300),
  CONSTRAINT ck_case_assignments_status CHECK (status IN ('pending_acceptance', 'accepted', 'declined', 'withdrawn', 'completed')),
  CONSTRAINT ck_case_assignments_responder CHECK (responder_id IS NOT NULL OR legacy_responder_user_id IS NOT NULL),
  CONSTRAINT ck_case_assignments_acceptance CHECK (status <> 'accepted' OR accepted_at IS NOT NULL),
  CONSTRAINT ck_case_assignments_ended CHECK (status IN ('pending_acceptance', 'accepted') OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_case_assignments_one_active_primary
  ON public.case_assignments (case_id)
  WHERE status IN ('pending_acceptance', 'accepted');
CREATE INDEX idx_case_assignments_responder_status
  ON public.case_assignments (responder_id, status, assigned_at DESC)
  WHERE responder_id IS NOT NULL;

CREATE TABLE public.safety_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  observer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  observer_role CHARACTER VARYING(24) NOT NULL,
  observation CHARACTER VARYING(24) NOT NULL,
  basis CHARACTER VARYING(32) NOT NULL DEFAULT 'unknown',
  note CHARACTER VARYING(1000),
  observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_safety_observations_role CHECK (observer_role IN ('guardian', 'barangay_responder')),
  CONSTRAINT ck_safety_observations_value CHECK (observation IN ('safe', 'not_safe', 'unable_to_verify')),
  CONSTRAINT ck_safety_observations_basis CHECK (basis IN ('in_person', 'remote_communication', 'third_party', 'unknown')),
  CONSTRAINT ck_safety_observations_note CHECK (note IS NULL OR length(note) <= 1000)
);
CREATE INDEX idx_safety_observations_case_time
  ON public.safety_observations (case_id, observed_at DESC);

CREATE TABLE public.case_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  assignment_id UUID REFERENCES public.case_assignments (id) ON DELETE RESTRICT,
  submitted_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  legacy_submitted_by_user_id UUID,
  actions_taken CHARACTER VARYING(2000) NOT NULL,
  resident_condition CHARACTER VARYING(1000) NOT NULL,
  outcome CHARACTER VARYING(32) NOT NULL,
  handover_details CHARACTER VARYING(1000),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT ck_case_reports_submitter CHECK (submitted_by IS NOT NULL OR legacy_submitted_by_user_id IS NOT NULL),
  CONSTRAINT ck_case_reports_outcome CHECK (outcome IN ('reunited', 'assisted_independently', 'referred', 'transferred', 'cancelled', 'duplicate')),
  CONSTRAINT ck_case_reports_review_fields CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT ck_case_reports_actions CHECK (length(btrim(actions_taken)) BETWEEN 1 AND 2000),
  CONSTRAINT ck_case_reports_condition CHECK (length(btrim(resident_condition)) BETWEEN 1 AND 1000)
);
CREATE INDEX idx_case_reports_case_submitted
  ON public.case_reports (case_id, submitted_at DESC);

CREATE TABLE public.case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  event_type CHARACTER VARYING(48) NOT NULL,
  actor_type CHARACTER VARYING(16) NOT NULL,
  actor_id UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  previous_status CHARACTER VARYING(20),
  new_status CHARACTER VARYING(20),
  correlation_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_case_events_actor CHECK (
    (actor_type = 'public' AND actor_id IS NULL)
    OR (actor_type IN ('profile', 'system') AND (actor_id IS NOT NULL OR actor_type = 'system'))
  ),
  CONSTRAINT ck_case_events_statuses CHECK (
    (previous_status IS NULL OR previous_status IN ('new', 'in_progress', 'escalated', 'closed'))
    AND (new_status IS NULL OR new_status IN ('new', 'in_progress', 'escalated', 'closed'))
  )
);
CREATE INDEX idx_case_events_case_created ON public.case_events (case_id, created_at DESC);

-- The legacy audit table is preserved and extended for profiles created by
-- Supabase Auth. Legacy actor_id rows remain readable by the old backend only.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_profile_id UUID REFERENCES public.profiles (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS result CHARACTER VARYING(24),
  ADD COLUMN IF NOT EXISTS correlation_id UUID;
CREATE INDEX IF NOT EXISTS idx_audit_logs_profile_created
  ON public.audit_logs (actor_profile_id, created_at DESC)
  WHERE actor_profile_id IS NOT NULL;

CREATE TABLE public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  token CHARACTER VARYING(512) NOT NULL UNIQUE,
  platform CHARACTER VARYING(16) NOT NULL DEFAULT 'android',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_registered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_device_tokens_platform CHECK (platform IN ('android', 'ios', 'web')),
  CONSTRAINT ck_device_tokens_token CHECK (length(btrim(token)) BETWEEN 20 AND 512)
);
CREATE INDEX idx_device_tokens_user_active ON public.device_tokens (user_id) WHERE is_active;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  source_event_id UUID NOT NULL UNIQUE,
  event_type CHARACTER VARYING(48) NOT NULL,
  title CHARACTER VARYING(120) NOT NULL,
  body CHARACTER VARYING(240) NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE,
  provider_accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.assistance_cases (id) ON DELETE RESTRICT,
  event_type CHARACTER VARYING(48) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status CHARACTER VARYING(20) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMP WITH TIME ZONE,
  provider_ticket_id CHARACTER VARYING(160),
  provider_receipt_id CHARACTER VARYING(160),
  last_error_code CHARACTER VARYING(80),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_notification_outbox_status CHECK (status IN ('pending', 'processing', 'attempted', 'accepted', 'failed')),
  CONSTRAINT ck_notification_outbox_attempts CHECK (attempts >= 0),
  CONSTRAINT ck_notification_outbox_payload CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX idx_notification_outbox_ready
  ON public.notification_outbox (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

-- The public API starts with no general table grants. Only an authenticated
-- user may read their own active profile and approved barangay contact fields.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'barangay_contacts', 'guardian_links', 'qr_cards',
    'assistance_cases', 'case_assignments', 'safety_observations',
    'case_reports', 'case_events', 'device_tokens', 'notifications',
    'notification_outbox'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
  END LOOP;
END
$$;

-- Close client access to legacy base tables too. The Express owner connection
-- remains able to operate during the staged migration; public API roles cannot.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'barangays', 'residents', 'users', 'qr_tokens', 'incidents',
    'incident_responses', 'incident_guardian_followups', 'incident_outcomes',
    'incident_cancellations', 'incident_confirmations', 'incident_location_shares',
    'otp_codes', 'otp_request_log', 'refresh_tokens', 'push_tokens',
    'schema_migrations', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
  END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON public.incident_details FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

CREATE POLICY profiles_read_own_active
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()) AND is_active);

CREATE POLICY barangays_read_own_active
  ON public.barangays FOR SELECT TO authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active
        AND p.barangay_id = barangays.id
    )
  );

CREATE POLICY barangay_contacts_read_approved_public
  ON public.barangay_contacts FOR SELECT TO anon, authenticated
  USING (is_public AND is_active AND verified_by IS NOT NULL AND verified_at IS NOT NULL);

GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT (id, name, municipality, province, is_active)
  ON TABLE public.barangays TO authenticated;
GRANT SELECT (id, barangay_id, label, phone_number, availability, verified_at)
  ON TABLE public.barangay_contacts TO anon, authenticated;

-- Server-side Edge Functions may use the service role, which bypasses RLS.
-- The secret key must never be shipped to the mobile or browser clients.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles, public.barangay_contacts, public.guardian_links, public.qr_cards,
  public.assistance_cases, public.case_assignments, public.safety_observations,
  public.case_reports, public.case_events, public.device_tokens, public.notifications,
  public.notification_outbox, public.audit_logs, public.residents, public.barangays
TO service_role;

COMMENT ON TABLE public.profiles IS 'Supabase Auth-linked application role profile; role/status are server controlled.';
COMMENT ON TABLE public.guardian_links IS 'Verified guardian-to-resident relationship history; pending links grant no resident access.';
COMMENT ON TABLE public.qr_cards IS 'Opaque QR card tokens stored as SHA-256 digests; migrated legacy cards have legacy_source=true.';
COMMENT ON TABLE public.assistance_cases IS 'Community assistance and reunification cases; Safe observations never close a case automatically.';
COMMENT ON TABLE public.notification_outbox IS 'Durable notification work recorded in the same transaction as the originating case event.';
