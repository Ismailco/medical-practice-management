CREATE TYPE "public"."audit_action" AS ENUM('AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGIN_FAILED', 'AUTH_LOGIN_THROTTLED', 'AUTH_LOGOUT', 'USER_SECRETARY_CREATED', 'USER_SECRETARY_DISABLED', 'USER_SECRETARY_ENABLED', 'USER_SECRETARY_PASSWORD_RESET', 'USER_DOCTOR_BOOTSTRAPPED', 'USER_DOCTOR_PASSWORD_RESET');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('DOCTOR', 'SECRETARY');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_account_credential_password_check" CHECK ("auth_account"."provider_id" <> 'credential' OR "auth_account"."password" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "audit_log_entity_type_nonempty_check" CHECK (length(btrim("audit_log"."entity_type")) > 0),
	CONSTRAINT "audit_log_metadata_object_check" CHECK (jsonb_typeof("audit_log"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "login_throttle" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_throttle_key_hash_length_check" CHECK (length("login_throttle"."key_hash") = 64),
	CONSTRAINT "login_throttle_failed_attempts_check" CHECK ("login_throttle"."failed_attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limit_count_positive_check" CHECK ("auth_rate_limit"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_user_email_normalized_check" CHECK ("auth_user"."email" = lower(btrim("auth_user"."email")))
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_auth_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_issuer_account_id_unique" ON "auth_account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "auth_account_user_id_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_occurred_at_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_occurred_at_idx" ON "audit_log" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "login_throttle_blocked_until_idx" ON "login_throttle" USING btree ("blocked_until");--> statement-breakpoint
CREATE INDEX "login_throttle_updated_at_idx" ON "login_throttle" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limit_key_unique" ON "auth_rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "auth_rate_limit_last_request_idx" ON "auth_rate_limit" USING btree ("last_request");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_unique" ON "auth_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_session_user_id_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_email_lower_unique" ON "auth_user" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "auth_user_single_doctor_unique" ON "auth_user" USING btree ("role") WHERE "auth_user"."role" = 'DOCTOR';--> statement-breakpoint
CREATE INDEX "auth_user_role_active_idx" ON "auth_user" USING btree ("role","active");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "auth_verification_expires_at_idx" ON "auth_verification" USING btree ("expires_at");
--> statement-breakpoint
CREATE FUNCTION "prevent_audit_log_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only"
BEFORE UPDATE OR DELETE ON "audit_log"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_log_mutation"();
