CREATE TYPE "public"."consultation_status" AS ENUM('IN_PROGRESS', 'FINALIZED');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CONSULTATION_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CLINICAL_NOTE_REVISION_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CONSULTATION_FINALIZED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'CLINICAL_ADDENDUM_CREATED';--> statement-breakpoint
CREATE TABLE "clinical_note_addendum" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_note_addendum_content_check" CHECK (length(btrim("clinical_note_addendum"."content")) BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE "clinical_note_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultation_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"reason_for_visit" text,
	"observations" text,
	"diagnosis" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinical_note_revision_number_positive_check" CHECK ("clinical_note_revision"."revision_number" >= 1),
	CONSTRAINT "clinical_note_revision_content_check" CHECK ("clinical_note_revision"."reason_for_visit" IS NOT NULL OR "clinical_note_revision"."observations" IS NOT NULL OR "clinical_note_revision"."diagnosis" IS NOT NULL OR "clinical_note_revision"."notes" IS NOT NULL),
	CONSTRAINT "clinical_note_revision_reason_length_check" CHECK ("clinical_note_revision"."reason_for_visit" IS NULL OR length("clinical_note_revision"."reason_for_visit") <= 2000),
	CONSTRAINT "clinical_note_revision_observations_length_check" CHECK ("clinical_note_revision"."observations" IS NULL OR length("clinical_note_revision"."observations") <= 10000),
	CONSTRAINT "clinical_note_revision_diagnosis_length_check" CHECK ("clinical_note_revision"."diagnosis" IS NULL OR length("clinical_note_revision"."diagnosis") <= 4000),
	CONSTRAINT "clinical_note_revision_notes_length_check" CHECK ("clinical_note_revision"."notes" IS NULL OR length("clinical_note_revision"."notes") <= 20000)
);
--> statement-breakpoint
CREATE TABLE "consultation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"appointment_id" uuid,
	"doctor_id" uuid NOT NULL,
	"status" "consultation_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"final_revision_id" uuid,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultation_version_positive_check" CHECK ("consultation"."version" >= 1),
	CONSTRAINT "consultation_revision_count_check" CHECK ("consultation"."revision_count" >= 0),
	CONSTRAINT "consultation_finalization_state_check" CHECK (("consultation"."status" = 'IN_PROGRESS' AND "consultation"."finalized_at" IS NULL AND "consultation"."final_revision_id" IS NULL) OR ("consultation"."status" = 'FINALIZED' AND "consultation"."finalized_at" IS NOT NULL AND "consultation"."final_revision_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "clinical_note_addendum" ADD CONSTRAINT "clinical_note_addendum_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_note_addendum" ADD CONSTRAINT "clinical_note_addendum_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_note_revision" ADD CONSTRAINT "clinical_note_revision_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_note_revision" ADD CONSTRAINT "clinical_note_revision_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_appointment_id_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_doctor_id_auth_user_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinical_note_addendum_consultation_created_idx" ON "clinical_note_addendum" USING btree ("consultation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_note_revision_number_unique" ON "clinical_note_revision" USING btree ("consultation_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "clinical_note_revision_consultation_id_unique" ON "clinical_note_revision" USING btree ("consultation_id","id");--> statement-breakpoint
CREATE INDEX "clinical_note_revision_created_at_idx" ON "clinical_note_revision" USING btree ("consultation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_appointment_unique" ON "consultation" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "consultation_patient_started_idx" ON "consultation" USING btree ("patient_id","started_at");--> statement-breakpoint
CREATE INDEX "consultation_status_started_idx" ON "consultation" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "consultation_doctor_started_idx" ON "consultation" USING btree ("doctor_id","started_at");--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_final_revision_ownership_fk"
  FOREIGN KEY ("id", "final_revision_id")
  REFERENCES "clinical_note_revision" ("consultation_id", "id")
  ON DELETE RESTRICT;--> statement-breakpoint
CREATE FUNCTION protect_clinical_note_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  consultation_status_value consultation_status;
  current_revision_count integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status, revision_count
    INTO consultation_status_value, current_revision_count
    FROM consultation
    WHERE id = NEW.consultation_id
    FOR UPDATE;
    IF consultation_status_value IS DISTINCT FROM 'IN_PROGRESS'
      OR NEW.revision_number IS DISTINCT FROM current_revision_count + 1 THEN
      RAISE EXCEPTION 'clinical note revision is not valid for the consultation state';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'clinical note revisions are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER clinical_note_revision_append_only
BEFORE INSERT OR UPDATE OR DELETE ON "clinical_note_revision"
FOR EACH ROW EXECUTE FUNCTION protect_clinical_note_revision();--> statement-breakpoint
CREATE FUNCTION protect_clinical_note_addendum() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM consultation
      WHERE id = NEW.consultation_id AND status = 'FINALIZED'
    ) THEN
      RAISE EXCEPTION 'clinical addenda require a finalized consultation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'clinical note addenda are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER clinical_note_addendum_guard
BEFORE INSERT OR UPDATE OR DELETE ON "clinical_note_addendum"
FOR EACH ROW EXECUTE FUNCTION protect_clinical_note_addendum();--> statement-breakpoint
CREATE FUNCTION protect_consultation_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  linked_patient_id uuid;
  final_revision_number integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'consultations cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'FINALIZED' THEN
      RAISE EXCEPTION 'finalized consultations are immutable';
    END IF;
    IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
      OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
      OR NEW.started_at IS DISTINCT FROM OLD.started_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'consultation identity is immutable';
    END IF;
  END IF;

  IF NEW.appointment_id IS NOT NULL THEN
    SELECT patient_id INTO linked_patient_id FROM appointment WHERE id = NEW.appointment_id;
    IF linked_patient_id IS NULL OR linked_patient_id IS DISTINCT FROM NEW.patient_id THEN
      RAISE EXCEPTION 'consultation patient must match appointment patient';
    END IF;
  END IF;
  IF NEW.status = 'FINALIZED' THEN
    SELECT revision_number INTO final_revision_number
    FROM clinical_note_revision
    WHERE consultation_id = NEW.id AND id = NEW.final_revision_id;
    IF final_revision_number IS NULL OR final_revision_number IS DISTINCT FROM NEW.revision_count THEN
      RAISE EXCEPTION 'final revision must be the current consultation revision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER consultation_record_guard
BEFORE INSERT OR UPDATE OR DELETE ON "consultation"
FOR EACH ROW EXECUTE FUNCTION protect_consultation_record();
