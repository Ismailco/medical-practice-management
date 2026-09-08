CREATE TYPE "public"."follow_up_status" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'FOLLOW_UP_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'FOLLOW_UP_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'FOLLOW_UP_COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'FOLLOW_UP_CANCELLED';--> statement-breakpoint
CREATE TABLE "follow_up" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"consultation_id" uuid,
	"created_by" uuid NOT NULL,
	"due_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" "follow_up_status" DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "follow_up_version_positive_check" CHECK ("follow_up"."version" >= 1),
	CONSTRAINT "follow_up_reason_check" CHECK (length(btrim("follow_up"."reason")) BETWEEN 1 AND 2000 AND "follow_up"."reason" = btrim("follow_up"."reason")),
	CONSTRAINT "follow_up_lifecycle_metadata_check" CHECK (("follow_up"."status" = 'PENDING' AND "follow_up"."completed_at" IS NULL AND "follow_up"."completed_by" IS NULL AND "follow_up"."cancelled_at" IS NULL AND "follow_up"."cancelled_by" IS NULL) OR ("follow_up"."status" = 'COMPLETED' AND "follow_up"."completed_at" IS NOT NULL AND "follow_up"."completed_by" IS NOT NULL AND "follow_up"."cancelled_at" IS NULL AND "follow_up"."cancelled_by" IS NULL) OR ("follow_up"."status" = 'CANCELLED' AND "follow_up"."completed_at" IS NULL AND "follow_up"."completed_by" IS NULL AND "follow_up"."cancelled_at" IS NOT NULL AND "follow_up"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_completed_by_auth_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_cancelled_by_auth_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consultation_patient_id_unique" ON "consultation" USING btree ("patient_id","id");--> statement-breakpoint
ALTER TABLE "follow_up" ADD CONSTRAINT "follow_up_consultation_patient_fk" FOREIGN KEY ("patient_id","consultation_id") REFERENCES "public"."consultation"("patient_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_up_status_due_date_idx" ON "follow_up" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "follow_up_patient_due_date_idx" ON "follow_up" USING btree ("patient_id","due_date");--> statement-breakpoint
CREATE INDEX "follow_up_consultation_idx" ON "follow_up" USING btree ("consultation_id");--> statement-breakpoint
CREATE FUNCTION protect_follow_up_record() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'follow-ups cannot be deleted';
  END IF;

  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'terminal follow-ups are immutable';
  END IF;
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id
    OR NEW.consultation_id IS DISTINCT FROM OLD.consultation_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'follow-up identity is immutable';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'follow-up updates must increment version';
  END IF;
  IF NEW.status <> 'PENDING'
    AND (NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.reason IS DISTINCT FROM OLD.reason) THEN
    RAISE EXCEPTION 'follow-up content cannot change during a lifecycle transition';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER follow_up_record_guard
BEFORE UPDATE OR DELETE ON "follow_up"
FOR EACH ROW EXECUTE FUNCTION protect_follow_up_record();
