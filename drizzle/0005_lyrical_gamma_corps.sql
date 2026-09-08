CREATE TYPE "public"."prescription_status" AS ENUM('DRAFT', 'FINALIZED', 'VOID');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_DRAFT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_DRAFT_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_DRAFT_DISCARDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_FINALIZED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_VOIDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_DUPLICATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRESCRIPTION_REPLACEMENT_DRAFT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PRACTICE_PROFILE_UPDATED';--> statement-breakpoint
CREATE TABLE "clinic_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_profile_singleton_check" CHECK ("clinic_profile"."id" = 1),
	CONSTRAINT "clinic_profile_name_check" CHECK (length(btrim("clinic_profile"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "clinic_profile_address_check" CHECK ("clinic_profile"."address" IS NULL OR length("clinic_profile"."address") <= 500),
	CONSTRAINT "clinic_profile_phone_check" CHECK ("clinic_profile"."phone" IS NULL OR length("clinic_profile"."phone") <= 50),
	CONSTRAINT "clinic_profile_version_positive_check" CHECK ("clinic_profile"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "doctor_professional_profile" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"specialty" text,
	"professional_identifier" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_profile_display_name_check" CHECK (length(btrim("doctor_professional_profile"."display_name")) BETWEEN 1 AND 200),
	CONSTRAINT "doctor_profile_specialty_check" CHECK ("doctor_professional_profile"."specialty" IS NULL OR length("doctor_professional_profile"."specialty") <= 200),
	CONSTRAINT "doctor_profile_identifier_check" CHECK ("doctor_professional_profile"."professional_identifier" IS NULL OR length("doctor_professional_profile"."professional_identifier") <= 200),
	CONSTRAINT "doctor_profile_version_positive_check" CHECK ("doctor_professional_profile"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "prescription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"consultation_id" uuid,
	"doctor_id" uuid NOT NULL,
	"status" "prescription_status" DEFAULT 'DRAFT' NOT NULL,
	"prescription_number" text,
	"issued_at" timestamp with time zone,
	"issue_date" date,
	"replaces_prescription_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "prescription_version_positive_check" CHECK ("prescription"."version" >= 1),
	CONSTRAINT "prescription_number_format_check" CHECK ("prescription"."prescription_number" IS NULL OR "prescription"."prescription_number" ~ '^RX-[0-9]{6,}$'),
	CONSTRAINT "prescription_state_metadata_check" CHECK (("prescription"."status" = 'DRAFT' AND "prescription"."prescription_number" IS NULL AND "prescription"."issued_at" IS NULL AND "prescription"."issue_date" IS NULL AND "prescription"."voided_at" IS NULL AND "prescription"."voided_by" IS NULL) OR ("prescription"."status" = 'FINALIZED' AND "prescription"."prescription_number" IS NOT NULL AND "prescription"."issued_at" IS NOT NULL AND "prescription"."issue_date" IS NOT NULL AND "prescription"."voided_at" IS NULL AND "prescription"."voided_by" IS NULL) OR ("prescription"."status" = 'VOID' AND "prescription"."prescription_number" IS NOT NULL AND "prescription"."issued_at" IS NOT NULL AND "prescription"."issue_date" IS NOT NULL AND "prescription"."voided_at" IS NOT NULL AND "prescription"."voided_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "prescription_counter" (
	"id" integer PRIMARY KEY NOT NULL,
	"next_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_issue_snapshot" (
	"prescription_id" uuid PRIMARY KEY NOT NULL,
	"patient_number" text NOT NULL,
	"patient_name" text NOT NULL,
	"patient_date_of_birth" date NOT NULL,
	"doctor_name" text NOT NULL,
	"doctor_specialty" text,
	"doctor_professional_identifier" text,
	"clinic_name" text NOT NULL,
	"clinic_address" text,
	"clinic_phone" text,
	"template_version" text DEFAULT 'phase6-v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_snapshot_patient_number_check" CHECK (length(btrim("prescription_issue_snapshot"."patient_number")) > 0),
	CONSTRAINT "prescription_snapshot_patient_name_check" CHECK (length(btrim("prescription_issue_snapshot"."patient_name")) > 0),
	CONSTRAINT "prescription_snapshot_doctor_name_check" CHECK (length(btrim("prescription_issue_snapshot"."doctor_name")) > 0),
	CONSTRAINT "prescription_snapshot_clinic_name_check" CHECK (length(btrim("prescription_issue_snapshot"."clinic_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "prescription_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prescription_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"medication_name" text NOT NULL,
	"dosage" text,
	"form" text,
	"frequency" text,
	"duration" text,
	"quantity" text,
	"route" text,
	"instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescription_item_position_check" CHECK ("prescription_item"."position" >= 0),
	CONSTRAINT "prescription_item_medication_name_check" CHECK (length(btrim("prescription_item"."medication_name")) BETWEEN 1 AND 200),
	CONSTRAINT "prescription_item_dosage_check" CHECK ("prescription_item"."dosage" IS NULL OR length("prescription_item"."dosage") <= 200),
	CONSTRAINT "prescription_item_form_check" CHECK ("prescription_item"."form" IS NULL OR length("prescription_item"."form") <= 100),
	CONSTRAINT "prescription_item_frequency_check" CHECK ("prescription_item"."frequency" IS NULL OR length("prescription_item"."frequency") <= 200),
	CONSTRAINT "prescription_item_duration_check" CHECK ("prescription_item"."duration" IS NULL OR length("prescription_item"."duration") <= 200),
	CONSTRAINT "prescription_item_quantity_check" CHECK ("prescription_item"."quantity" IS NULL OR length("prescription_item"."quantity") <= 100),
	CONSTRAINT "prescription_item_route_check" CHECK ("prescription_item"."route" IS NULL OR length("prescription_item"."route") <= 100),
	CONSTRAINT "prescription_item_instructions_check" CHECK ("prescription_item"."instructions" IS NULL OR length("prescription_item"."instructions") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "doctor_professional_profile" ADD CONSTRAINT "doctor_professional_profile_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_doctor_id_auth_user_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_replaces_prescription_id_prescription_id_fk" FOREIGN KEY ("replaces_prescription_id") REFERENCES "public"."prescription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_voided_by_auth_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_consultation_patient_fk" FOREIGN KEY ("patient_id","consultation_id") REFERENCES "public"."consultation"("patient_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_issue_snapshot_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_item" ADD CONSTRAINT "prescription_item_prescription_id_prescription_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_patient_id_unique" ON "prescription" USING btree ("patient_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_number_unique" ON "prescription" USING btree ("prescription_number");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_issued_replacement_unique" ON "prescription" USING btree ("replaces_prescription_id") WHERE "prescription"."status" IN ('FINALIZED', 'VOID') AND "prescription"."replaces_prescription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prescription_patient_created_idx" ON "prescription" USING btree ("patient_id","created_at");--> statement-breakpoint
CREATE INDEX "prescription_status_created_idx" ON "prescription" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "prescription_consultation_idx" ON "prescription" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "prescription_replacement_idx" ON "prescription" USING btree ("replaces_prescription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prescription_item_position_unique" ON "prescription_item" USING btree ("prescription_id","position");--> statement-breakpoint
CREATE INDEX "prescription_item_prescription_idx" ON "prescription_item" USING btree ("prescription_id","position");
--> statement-breakpoint
INSERT INTO "prescription_counter" ("id", "next_number") VALUES (1, 1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION protect_prescription_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'issued prescriptions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'VOID' THEN
    RAISE EXCEPTION 'void prescriptions are immutable';
  END IF;

  IF OLD.status = 'FINALIZED' THEN
    IF NEW.status <> 'VOID'
      OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
      OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
      OR NEW.prescription_number IS DISTINCT FROM OLD.prescription_number
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.replaces_prescription_id IS DISTINCT FROM OLD.replaces_prescription_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'finalized prescription contents are immutable';
    END IF;
    IF NEW.version IS DISTINCT FROM OLD.version + 1
      OR NEW.voided_at IS NULL
      OR NEW.voided_by IS NULL THEN
      RAISE EXCEPTION 'prescription void must increment version and record actor/time';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' THEN
    IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
      RAISE EXCEPTION 'prescription updates must increment version';
    END IF;
    IF NEW.status = 'DRAFT' THEN
      IF NEW.prescription_number IS NOT NULL OR NEW.issued_at IS NOT NULL OR NEW.issue_date IS NOT NULL
        OR NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL THEN
        RAISE EXCEPTION 'draft prescription cannot contain issued metadata';
      END IF;
    ELSIF NEW.status = 'FINALIZED' THEN
      IF NEW.prescription_number IS NULL OR NEW.issued_at IS NULL OR NEW.issue_date IS NULL THEN
        RAISE EXCEPTION 'finalized prescription requires issue metadata';
      END IF;
    ELSE
      RAISE EXCEPTION 'draft prescription can only remain draft or be finalized';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'unknown prescription lifecycle state';
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescription_record_guard
BEFORE UPDATE OR DELETE ON "prescription"
FOR EACH ROW EXECUTE FUNCTION protect_prescription_record();
--> statement-breakpoint
CREATE FUNCTION validate_prescription_replacement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_status "prescription_status";
BEGIN
  IF NEW.replaces_prescription_id IS NOT NULL THEN
    IF NEW.id = NEW.replaces_prescription_id THEN
      RAISE EXCEPTION 'a prescription cannot replace itself';
    END IF;
    SELECT status INTO target_status FROM "prescription" WHERE id = NEW.replaces_prescription_id;
    IF target_status IS NULL OR target_status NOT IN ('FINALIZED', 'VOID') THEN
      RAISE EXCEPTION 'a replacement must target an issued prescription';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescription_replacement_guard
BEFORE INSERT OR UPDATE OF replaces_prescription_id ON "prescription"
FOR EACH ROW EXECUTE FUNCTION validate_prescription_replacement();
--> statement-breakpoint
CREATE FUNCTION protect_prescription_item_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_status "prescription_status";
BEGIN
  SELECT status INTO parent_status FROM "prescription" WHERE id = COALESCE(NEW.prescription_id, OLD.prescription_id);
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'prescription items are immutable after finalization';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescription_item_record_guard
BEFORE INSERT OR UPDATE OR DELETE ON "prescription_item"
FOR EACH ROW EXECUTE FUNCTION protect_prescription_item_record();
--> statement-breakpoint
CREATE FUNCTION protect_prescription_snapshot_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'prescription issue snapshots are immutable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "prescription" WHERE id = NEW.prescription_id AND status IN ('FINALIZED', 'VOID')) THEN
    RAISE EXCEPTION 'issue snapshot requires an issued prescription';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER prescription_snapshot_record_guard
BEFORE INSERT OR UPDATE OR DELETE ON "prescription_issue_snapshot"
FOR EACH ROW EXECUTE FUNCTION protect_prescription_snapshot_record();
--> statement-breakpoint
CREATE FUNCTION ensure_prescription_issue_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('FINALIZED', 'VOID') AND NOT EXISTS (
    SELECT 1 FROM "prescription_issue_snapshot" WHERE prescription_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'issued prescription requires exactly one issue snapshot';
  END IF;
  IF NEW.status = 'DRAFT' AND EXISTS (
    SELECT 1 FROM "prescription_issue_snapshot" WHERE prescription_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'draft prescription cannot have an issue snapshot';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER prescription_issue_snapshot_required
AFTER INSERT OR UPDATE ON "prescription"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_prescription_issue_snapshot();
