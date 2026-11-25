


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."snapshot_incident_guardian"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  SELECT EXISTS(SELECT 1 FROM residents r JOIN users u ON u.id=r.guardian_id
    WHERE r.id=NEW.resident_id AND u.role='guardian') INTO NEW.guardian_required;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."snapshot_incident_guardian"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_resident_guardian"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.guardian_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM users WHERE id=NEW.guardian_id AND role='guardian') THEN
    RAISE EXCEPTION 'Guardian must reference a guardian account' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_resident_guardian"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_role" character varying(30),
    "action" character varying(100) NOT NULL,
    "entity_type" character varying(50) NOT NULL,
    "entity_id" "uuid",
    "metadata" json DEFAULT '{}'::json NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ck_audit_logs_actor_role" CHECK ((("actor_role")::"text" = ANY ((ARRAY['guardian'::character varying, 'barangay_official'::character varying, 'barangay_responder'::character varying])::"text"[])))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."barangays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(150) NOT NULL,
    "municipality" character varying(150) NOT NULL,
    "province" character varying(150) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."barangays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_cancellations" (
    "incident_id" "uuid" NOT NULL,
    "cancel_token" character varying(64),
    "cancellable_until" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancelled_reason" character varying(100)
);


ALTER TABLE "public"."incident_cancellations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_confirmations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incident_id" "uuid" NOT NULL,
    "source" character varying(30) NOT NULL,
    "submitted_by" "uuid" NOT NULL,
    "decision" character varying(20) NOT NULL,
    "summary_notes" character varying(1000),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ck_incident_confirmations_decision" CHECK ((("decision")::"text" = ANY ((ARRAY['safe'::character varying, 'not_safe'::character varying])::"text"[]))),
    CONSTRAINT "ck_incident_confirmations_source" CHECK ((("source")::"text" = ANY ((ARRAY['guardian'::character varying, 'barangay_responder'::character varying])::"text"[])))
);


ALTER TABLE "public"."incident_confirmations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_guardian_followups" (
    "incident_id" "uuid" NOT NULL,
    "reminded_at" timestamp with time zone,
    "unreachable_at" timestamp with time zone,
    "unreachable_by" "uuid",
    "unreachable_reason" character varying(500)
);


ALTER TABLE "public"."incident_guardian_followups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_location_shares" (
    "token" character varying(64) NOT NULL,
    "incident_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "last_shared_at" timestamp with time zone,
    "stopped_at" timestamp with time zone,
    "latitude" double precision,
    "longitude" double precision,
    "address" character varying(500),
    "address_latitude" double precision,
    "address_longitude" double precision,
    CONSTRAINT "ck_incident_location_shares_latitude" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "ck_incident_location_shares_longitude" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."incident_location_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_outcomes" (
    "incident_id" "uuid" NOT NULL,
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "closed_by" "uuid",
    "closed_at" timestamp with time zone
);


ALTER TABLE "public"."incident_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incident_responses" (
    "incident_id" "uuid" NOT NULL,
    "responder_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reminded_at" timestamp with time zone,
    "unreachable_at" timestamp with time zone,
    "unreachable_reason" character varying(500),
    "report_submitted_by" "uuid",
    "report_submitted_at" timestamp with time zone,
    "final_action_summary" character varying(2000)
);


ALTER TABLE "public"."incident_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "resident_id" "uuid" NOT NULL,
    "qr_token" character varying(64),
    "status" character varying(30) DEFAULT 'active'::character varying NOT NULL,
    "scan_latitude" double precision,
    "scan_longitude" double precision,
    "bystander_notes" character varying(10000),
    "timeout_at" timestamp with time zone,
    "escalated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "guardian_required" boolean DEFAULT true NOT NULL,
    "report_count" integer DEFAULT 1 NOT NULL,
    "last_reported_at" timestamp with time zone,
    "scan_address" character varying(500),
    CONSTRAINT "ck_incidents_report_count" CHECK (("report_count" >= 1)),
    CONSTRAINT "ck_incidents_scan_latitude" CHECK ((("scan_latitude" >= ('-90'::integer)::double precision) AND ("scan_latitude" <= (90)::double precision))),
    CONSTRAINT "ck_incidents_scan_longitude" CHECK ((("scan_longitude" >= ('-180'::integer)::double precision) AND ("scan_longitude" <= (180)::double precision))),
    CONSTRAINT "ck_incidents_status" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'confirmed_safe'::character varying, 'confirmed_not_safe'::character varying, 'escalated'::character varying, 'assigned'::character varying, 'resolved'::character varying, 'closed'::character varying, 'cancelled'::character varying])::"text"[])))
);


ALTER TABLE "public"."incidents" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."incident_details" AS
 SELECT "i"."id",
    "i"."resident_id",
    "i"."qr_token",
    "i"."status",
    "i"."bystander_notes",
    "i"."scan_latitude",
    "i"."scan_longitude",
    "i"."scan_address",
    "i"."report_count",
    "i"."last_reported_at",
    "i"."guardian_required",
    "i"."timeout_at",
    "i"."escalated_at",
    "i"."created_at",
    "i"."updated_at",
    "r"."responder_id" AS "assigned_responder_id",
    "r"."assigned_by",
    "r"."assigned_at",
    "r"."reminded_at" AS "responder_reminded_at",
    "r"."unreachable_at" AS "responder_unreachable_at",
    "r"."unreachable_reason" AS "responder_unreachable_reason",
    "r"."report_submitted_by",
    "r"."report_submitted_at",
    "r"."final_action_summary",
    "g"."reminded_at" AS "guardian_reminded_at",
    "g"."unreachable_at" AS "guardian_unreachable_at",
    "g"."unreachable_by" AS "guardian_unreachable_by",
    "g"."unreachable_reason" AS "guardian_unreachable_reason",
    "o"."resolved_by",
    "o"."resolved_at",
    "o"."closed_by",
    "o"."closed_at",
    "c"."cancellable_until",
    "c"."cancelled_at",
    "c"."cancelled_reason",
    "ls"."latitude" AS "live_latitude",
    "ls"."longitude" AS "live_longitude",
    "ls"."last_shared_at" AS "live_location_updated_at",
    "ls"."address" AS "live_address",
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM "public"."incident_location_shares" "a"
              WHERE (("a"."incident_id" = "i"."id") AND ("a"."stopped_at" IS NULL) AND ("a"."last_shared_at" IS NOT NULL)))) THEN true
            ELSE false
        END AS "live_location_sharing"
   FROM ((((("public"."incidents" "i"
     LEFT JOIN "public"."incident_responses" "r" ON (("r"."incident_id" = "i"."id")))
     LEFT JOIN "public"."incident_guardian_followups" "g" ON (("g"."incident_id" = "i"."id")))
     LEFT JOIN "public"."incident_outcomes" "o" ON (("o"."incident_id" = "i"."id")))
     LEFT JOIN "public"."incident_cancellations" "c" ON (("c"."incident_id" = "i"."id")))
     LEFT JOIN LATERAL ( SELECT "s"."latitude",
            "s"."longitude",
            "s"."address",
            "s"."last_shared_at"
           FROM "public"."incident_location_shares" "s"
          WHERE (("s"."incident_id" = "i"."id") AND ("s"."latitude" IS NOT NULL))
          ORDER BY "s"."last_shared_at" DESC
         LIMIT 1) "ls" ON (true));


ALTER VIEW "public"."incident_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identifier" character varying(254) NOT NULL,
    "channel" character varying(10) NOT NULL,
    "purpose" character varying(20) DEFAULT 'login'::character varying NOT NULL,
    "otp_hash" character varying(255) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "ck_otp_codes_attempts" CHECK (("attempts" >= 0)),
    CONSTRAINT "ck_otp_codes_channel" CHECK ((("channel")::"text" = ANY ((ARRAY['phone'::character varying, 'email'::character varying])::"text"[]))),
    CONSTRAINT "ck_otp_codes_purpose" CHECK ((("purpose")::"text" = ANY ((ARRAY['login'::character varying, 'signup'::character varying, 'verify_contact'::character varying])::"text"[])))
);


ALTER TABLE "public"."otp_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_request_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identifier" character varying(254) NOT NULL,
    "requester_ip" character varying(45),
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."otp_request_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "push_token" character varying(255) NOT NULL,
    "platform" character varying(20) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qr_tokens" (
    "token" character varying(64) NOT NULL,
    "resident_id" "uuid" NOT NULL,
    "status" character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "issued_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "ck_qr_tokens_status" CHECK ((("status")::"text" = ANY ((ARRAY['active'::character varying, 'revoked'::character varying, 'reissued'::character varying])::"text"[])))
);


ALTER TABLE "public"."qr_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refresh_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" character varying(128) NOT NULL,
    "device_id" character varying(255) NOT NULL,
    "platform" character varying(20) NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."refresh_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."residents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "full_name" character varying(150) NOT NULL,
    "date_of_birth" "date",
    "medical_notes" character varying(2000),
    "home_address" character varying(300),
    "guardian_id" "uuid",
    "enrolled_by" "uuid" NOT NULL,
    "barangay_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "resident_type" character varying(50),
    "resident_code" character varying(50),
    "guardian_relationship" character varying(100),
    "photo_path" character varying(300)
);


ALTER TABLE "public"."residents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schema_migrations" (
    "name" "text" NOT NULL,
    "checksum" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schema_migrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" character varying(30) NOT NULL,
    "full_name" character varying(150) NOT NULL,
    "phone_number" character varying(20),
    "email" character varying(254),
    "is_active" boolean DEFAULT true NOT NULL,
    "barangay_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "position" character varying(100),
    "home_address" character varying(300),
    "photo_path" character varying(300),
    CONSTRAINT "ck_users_email_lowercase" CHECK ((("email")::"text" = "lower"(("email")::"text"))),
    CONSTRAINT "ck_users_role" CHECK ((("role")::"text" = ANY ((ARRAY['guardian'::character varying, 'barangay_official'::character varying, 'barangay_responder'::character varying])::"text"[]))),
    CONSTRAINT "users_identifier_present" CHECK ((("phone_number" IS NOT NULL) OR ("email" IS NOT NULL)))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."barangays"
    ADD CONSTRAINT "barangays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_confirmations"
    ADD CONSTRAINT "incident_confirmations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_location_shares"
    ADD CONSTRAINT "incident_location_shares_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_codes"
    ADD CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_request_log"
    ADD CONSTRAINT "otp_request_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."incident_cancellations"
    ADD CONSTRAINT "pk_incident_cancellations" PRIMARY KEY ("incident_id");



ALTER TABLE ONLY "public"."incident_guardian_followups"
    ADD CONSTRAINT "pk_incident_guardian_followups" PRIMARY KEY ("incident_id");



ALTER TABLE ONLY "public"."incident_outcomes"
    ADD CONSTRAINT "pk_incident_outcomes" PRIMARY KEY ("incident_id");



ALTER TABLE ONLY "public"."incident_responses"
    ADD CONSTRAINT "pk_incident_responses" PRIMARY KEY ("incident_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."qr_tokens"
    ADD CONSTRAINT "qr_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_resident_code_key" UNIQUE ("resident_code");



ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("name");



ALTER TABLE ONLY "public"."incident_cancellations"
    ADD CONSTRAINT "uq_incident_cancellations_token" UNIQUE ("cancel_token");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_phone_number_key" UNIQUE ("phone_number");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_logs_created" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_confirmations_incident" ON "public"."incident_confirmations" USING "btree" ("incident_id");



CREATE INDEX "idx_incident_responses_responder" ON "public"."incident_responses" USING "btree" ("responder_id");



CREATE INDEX "idx_incidents_resident" ON "public"."incidents" USING "btree" ("resident_id");



CREATE INDEX "idx_incidents_status" ON "public"."incidents" USING "btree" ("status");



CREATE INDEX "idx_incidents_timeout" ON "public"."incidents" USING "btree" ("timeout_at") WHERE (("status")::"text" = 'active'::"text");



CREATE INDEX "idx_location_shares_incident" ON "public"."incident_location_shares" USING "btree" ("incident_id");



CREATE INDEX "idx_otp_expires" ON "public"."otp_codes" USING "btree" ("expires_at");



CREATE INDEX "idx_otp_identifier" ON "public"."otp_codes" USING "btree" ("identifier", "channel");



CREATE INDEX "idx_otp_req_log_identifier_time" ON "public"."otp_request_log" USING "btree" ("identifier", "created_at");



CREATE INDEX "idx_otp_req_log_ip_time" ON "public"."otp_request_log" USING "btree" ("requester_ip", "created_at");



CREATE UNIQUE INDEX "idx_qr_tokens_active_per_resident" ON "public"."qr_tokens" USING "btree" ("resident_id") WHERE (("status")::"text" = 'active'::"text");



CREATE INDEX "idx_qr_tokens_resident" ON "public"."qr_tokens" USING "btree" ("resident_id");



CREATE INDEX "idx_refresh_tokens_hash" ON "public"."refresh_tokens" USING "btree" ("token_hash");



CREATE UNIQUE INDEX "idx_refresh_tokens_user_device" ON "public"."refresh_tokens" USING "btree" ("user_id", "device_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_residents_barangay" ON "public"."residents" USING "btree" ("barangay_id");



CREATE INDEX "idx_residents_guardian" ON "public"."residents" USING "btree" ("guardian_id");



CREATE INDEX "idx_users_barangay" ON "public"."users" USING "btree" ("barangay_id");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "incident_guardian_snapshot" BEFORE INSERT ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."snapshot_incident_guardian"();



CREATE OR REPLACE TRIGGER "resident_guardian_role" BEFORE INSERT OR UPDATE OF "guardian_id" ON "public"."residents" FOR EACH ROW EXECUTE FUNCTION "public"."validate_resident_guardian"();



CREATE OR REPLACE TRIGGER "trg_incidents_updated_at" BEFORE UPDATE ON "public"."incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_residents_updated_at" BEFORE UPDATE ON "public"."residents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_cancellations"
    ADD CONSTRAINT "fk_incident_cancellations_incident" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_guardian_followups"
    ADD CONSTRAINT "fk_incident_guardian_followups_by" FOREIGN KEY ("unreachable_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_guardian_followups"
    ADD CONSTRAINT "fk_incident_guardian_followups_incident" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_outcomes"
    ADD CONSTRAINT "fk_incident_outcomes_closed_by" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_outcomes"
    ADD CONSTRAINT "fk_incident_outcomes_incident" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_outcomes"
    ADD CONSTRAINT "fk_incident_outcomes_resolved_by" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_responses"
    ADD CONSTRAINT "fk_incident_responses_assigned_by" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_responses"
    ADD CONSTRAINT "fk_incident_responses_incident" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_responses"
    ADD CONSTRAINT "fk_incident_responses_report_by" FOREIGN KEY ("report_submitted_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_responses"
    ADD CONSTRAINT "fk_incident_responses_responder" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_confirmations"
    ADD CONSTRAINT "incident_confirmations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incident_confirmations"
    ADD CONSTRAINT "incident_confirmations_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."incident_location_shares"
    ADD CONSTRAINT "incident_location_shares_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_qr_token_fkey" FOREIGN KEY ("qr_token") REFERENCES "public"."qr_tokens"("token");



ALTER TABLE ONLY "public"."incidents"
    ADD CONSTRAINT "incidents_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qr_tokens"
    ADD CONSTRAINT "qr_tokens_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."qr_tokens"
    ADD CONSTRAINT "qr_tokens_resident_id_fkey" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_barangay_id_fkey" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."residents"
    ADD CONSTRAINT "residents_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_barangay_fk" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id");



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incident_confirmations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."incidents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qr_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."residents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."barangays" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_cancellations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_confirmations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_guardian_followups" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_location_shares" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_outcomes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_responses" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incidents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."incident_details" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_codes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_request_log" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."push_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."qr_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."refresh_tokens" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."residents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."schema_migrations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."users" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";

-- Local-only baseline of the RESQR2 state after legacy migrations 001-016.
-- Generated from the empty, isolated local Supabase database on 2026-11-24.
-- Contains schema and migration checksums only; no application records.
-- Keep the original SQL files in src/db/migrations unchanged.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;

-- Preserve the legacy migration runner's immutable checksum ledger after
-- `supabase db reset` replays this schema-only baseline.
INSERT INTO public.schema_migrations (name, checksum) VALUES
  ('001_init.sql', '46b46c639394f2d3bec13a01ea29ffc35505553d80354422c665bd7946fa5bea'),
  ('002_add_resident_type.sql', 'd301f7bffb59c739a9bdb6b0c688b14043f5971a3b15474c87d48db5fbba184b'),
  ('003_remove_resident_medical_fields.sql', 'c3aef67b3a81dd4f5e2eec8556b8e3203a5f7264a2c4ffb208ec375931d06a72'),
  ('004_account_management.sql', '9c04e4070142f7a1f449a1b0247fe86a656d2edc81a8644fe5ceb187f3c07e9a'),
  ('005_incident_review.sql', '82e0f616dd29febb55fc39da2dbb5d5db6a9c6c017104001a7fefd77b4d4b202'),
  ('006_staff_guardian_separation.sql', '04f8b0ffe21d42fbabd22b0536292db58723bec72960536ac817978ce61cc94d'),
  ('007_incident_safety_actions.sql', 'c3f75f1664f4dd60d464f3117a5157f58bd0505cb5d078feef3c9f9675692292'),
  ('008_user_home_address.sql', 'c2cc3852a87f4865962b174763183503920b353c7a807518be7b0dd7101ee80d'),
  ('009_bystander_live_location.sql', '645901e49592e5663b63977a4438226032155dcf6291adb1827700afdca4e7d8'),
  ('010_repeat_reports_and_addresses.sql', 'e580baff93b1fdcfea1133f0dc85b3fe10eda7faad6fcb5d46f8a1e10e95735e'),
  ('011_drop_unused_columns.sql', '91f2548a3d86478bc50858f853eefdab3569ca1e4e98571c5f26febd15d09c37'),
  ('012_sql_standard_conformance.sql', 'ab1c30829c847b3f13bbeac3371e992de468e91ca06f209d3ebd3dda9e6a974f'),
  ('013_revoke_public_api_access.sql', '7df56eeb8cf82012514bca4a791d298c8d03f62662c014f852e22f5d8a70fa67'),
  ('014_split_incidents_by_topic.sql', 'ae3d7452b286786b013b276bd153d09431230778feee9287c56c84a6f110c08a'),
  ('015_simplify_unused_data.sql', 'a048f17c432c1bcb1308a0326936d9d9a2ebb06079fcf7a49211d0f613160a06'),
  ('016_profile_photos.sql', 'c32248bfba25fafbea3a8c906ca4fa05eea3cc4c3552e7df53006c186502c2b1');







