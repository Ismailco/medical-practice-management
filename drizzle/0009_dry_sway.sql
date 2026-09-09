ALTER TABLE "clinic_profile" ADD COLUMN "name_arabic" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "address_arabic" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "city_arabic" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "phone_secondary" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD COLUMN "logo_data_url" text;--> statement-breakpoint
ALTER TABLE "doctor_professional_profile" ADD COLUMN "display_name_arabic" text;--> statement-breakpoint
ALTER TABLE "doctor_professional_profile" ADD COLUMN "specialty_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "doctor_name_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "doctor_specialty_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_name_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_address_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_city" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_city_arabic" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_phone_secondary" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_email" text;--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD COLUMN "clinic_logo_data_url" text;--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_name_arabic_check" CHECK ("clinic_profile"."name_arabic" IS NULL OR length("clinic_profile"."name_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_address_arabic_check" CHECK ("clinic_profile"."address_arabic" IS NULL OR length("clinic_profile"."address_arabic") <= 500);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_city_check" CHECK ("clinic_profile"."city" IS NULL OR length("clinic_profile"."city") <= 100);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_city_arabic_check" CHECK ("clinic_profile"."city_arabic" IS NULL OR length("clinic_profile"."city_arabic") <= 100);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_phone_secondary_check" CHECK ("clinic_profile"."phone_secondary" IS NULL OR length("clinic_profile"."phone_secondary") <= 50);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_email_check" CHECK ("clinic_profile"."email" IS NULL OR length("clinic_profile"."email") <= 254);--> statement-breakpoint
ALTER TABLE "clinic_profile" ADD CONSTRAINT "clinic_profile_logo_data_url_check" CHECK ("clinic_profile"."logo_data_url" IS NULL OR length("clinic_profile"."logo_data_url") <= 1500000);--> statement-breakpoint
ALTER TABLE "doctor_professional_profile" ADD CONSTRAINT "doctor_profile_display_name_arabic_check" CHECK ("doctor_professional_profile"."display_name_arabic" IS NULL OR length("doctor_professional_profile"."display_name_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "doctor_professional_profile" ADD CONSTRAINT "doctor_profile_specialty_arabic_check" CHECK ("doctor_professional_profile"."specialty_arabic" IS NULL OR length("doctor_professional_profile"."specialty_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_doctor_name_arabic_check" CHECK ("prescription_issue_snapshot"."doctor_name_arabic" IS NULL OR length("prescription_issue_snapshot"."doctor_name_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_doctor_specialty_arabic_check" CHECK ("prescription_issue_snapshot"."doctor_specialty_arabic" IS NULL OR length("prescription_issue_snapshot"."doctor_specialty_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_clinic_name_arabic_check" CHECK ("prescription_issue_snapshot"."clinic_name_arabic" IS NULL OR length("prescription_issue_snapshot"."clinic_name_arabic") <= 200);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_clinic_address_arabic_check" CHECK ("prescription_issue_snapshot"."clinic_address_arabic" IS NULL OR length("prescription_issue_snapshot"."clinic_address_arabic") <= 500);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_clinic_city_check" CHECK ("prescription_issue_snapshot"."clinic_city" IS NULL OR length("prescription_issue_snapshot"."clinic_city") <= 100);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_clinic_city_arabic_check" CHECK ("prescription_issue_snapshot"."clinic_city_arabic" IS NULL OR length("prescription_issue_snapshot"."clinic_city_arabic") <= 100);--> statement-breakpoint
ALTER TABLE "prescription_issue_snapshot" ADD CONSTRAINT "prescription_snapshot_clinic_logo_check" CHECK ("prescription_issue_snapshot"."clinic_logo_data_url" IS NULL OR length("prescription_issue_snapshot"."clinic_logo_data_url") <= 1500000);