CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'ARRIVED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'APPOINTMENT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'APPOINTMENT_RESCHEDULED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'APPOINTMENT_STATUS_CHANGED';--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'SCHEDULED' NOT NULL,
	"administrative_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	CONSTRAINT "appointment_time_order_check" CHECK ("appointment"."scheduled_end" > "appointment"."scheduled_start"),
	CONSTRAINT "appointment_version_positive_check" CHECK ("appointment"."version" >= 1),
	CONSTRAINT "appointment_reason_length_check" CHECK ("appointment"."administrative_reason" IS NULL OR length("appointment"."administrative_reason") <= 160),
	CONSTRAINT "appointment_cancellation_metadata_check" CHECK (("appointment"."status" = 'CANCELLED') = ("appointment"."cancelled_at" IS NOT NULL AND "appointment"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_cancelled_by_auth_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."auth_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_scheduled_start_idx" ON "appointment" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "appointment_patient_start_idx" ON "appointment" USING btree ("patient_id","scheduled_start");--> statement-breakpoint
CREATE INDEX "appointment_status_start_idx" ON "appointment" USING btree ("status","scheduled_start");