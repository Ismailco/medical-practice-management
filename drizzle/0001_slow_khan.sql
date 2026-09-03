ALTER TYPE "public"."audit_action" ADD VALUE 'PATIENT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PATIENT_ADMIN_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PATIENT_ARCHIVED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'PATIENT_RESTORED';--> statement-breakpoint
CREATE SEQUENCE "public"."patient_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_number" text DEFAULT 'P-' || lpad(nextval('patient_number_seq')::text, 6, '0') NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"phone" text,
	"phone_normalized" text,
	"email" text,
	"address" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	CONSTRAINT "patient_number_format_check" CHECK ("patient"."patient_number" ~ '^P-[0-9]{6,}$'),
	CONSTRAINT "patient_first_name_check" CHECK (length(btrim("patient"."first_name")) BETWEEN 1 AND 100 AND "patient"."first_name" = btrim("patient"."first_name")),
	CONSTRAINT "patient_last_name_check" CHECK (length(btrim("patient"."last_name")) BETWEEN 1 AND 100 AND "patient"."last_name" = btrim("patient"."last_name")),
	CONSTRAINT "patient_date_of_birth_check" CHECK ("patient"."date_of_birth" <= CURRENT_DATE),
	CONSTRAINT "patient_phone_length_check" CHECK ("patient"."phone" IS NULL OR length("patient"."phone") <= 32),
	CONSTRAINT "patient_phone_normalized_check" CHECK ("patient"."phone_normalized" IS NULL OR "patient"."phone_normalized" ~ '^\+?[0-9]{5,20}$'),
	CONSTRAINT "patient_phone_pair_check" CHECK (("patient"."phone" IS NULL) = ("patient"."phone_normalized" IS NULL)),
	CONSTRAINT "patient_email_check" CHECK ("patient"."email" IS NULL OR (length("patient"."email") <= 254 AND "patient"."email" = lower(btrim("patient"."email")))),
	CONSTRAINT "patient_address_length_check" CHECK ("patient"."address" IS NULL OR length("patient"."address") <= 500),
	CONSTRAINT "patient_emergency_name_length_check" CHECK ("patient"."emergency_contact_name" IS NULL OR length("patient"."emergency_contact_name") <= 100),
	CONSTRAINT "patient_emergency_phone_length_check" CHECK ("patient"."emergency_contact_phone" IS NULL OR length("patient"."emergency_contact_phone") <= 32),
	CONSTRAINT "patient_version_positive_check" CHECK ("patient"."version" >= 1),
	CONSTRAINT "patient_archive_pair_check" CHECK (("patient"."archived_at" IS NULL) = ("patient"."archived_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_archived_by_auth_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_patient_number_unique" ON "patient" USING btree ("patient_number");--> statement-breakpoint
CREATE INDEX "patient_active_name_idx" ON "patient" USING btree ("last_name","first_name","patient_number") WHERE "patient"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "patient_phone_normalized_idx" ON "patient" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "patient_email_lower_idx" ON "patient" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "patient_archived_at_idx" ON "patient" USING btree ("archived_at");--> statement-breakpoint
CREATE FUNCTION "prevent_patient_number_change"() RETURNS trigger AS $$
BEGIN
	IF NEW.patient_number IS DISTINCT FROM OLD.patient_number THEN
		RAISE EXCEPTION 'patient_number is immutable';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "patient_number_immutable"
BEFORE UPDATE OF "patient_number" ON "patient"
FOR EACH ROW EXECUTE FUNCTION "prevent_patient_number_change"();
