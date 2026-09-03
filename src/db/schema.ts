import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const staffRole = pgEnum("staff_role", ["DOCTOR", "SECRETARY"]);
export const auditAction = pgEnum("audit_action", [
  "AUTH_LOGIN_SUCCEEDED",
  "AUTH_LOGIN_FAILED",
  "AUTH_LOGIN_THROTTLED",
  "AUTH_LOGOUT",
  "USER_SECRETARY_CREATED",
  "USER_SECRETARY_DISABLED",
  "USER_SECRETARY_ENABLED",
  "USER_SECRETARY_PASSWORD_RESET",
  "USER_DOCTOR_BOOTSTRAPPED",
  "USER_DOCTOR_PASSWORD_RESET",
  "PATIENT_CREATED",
  "PATIENT_ADMIN_UPDATED",
  "PATIENT_ARCHIVED",
  "PATIENT_RESTORED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_RESCHEDULED",
  "APPOINTMENT_STATUS_CHANGED",
  "CONSULTATION_CREATED",
  "CLINICAL_NOTE_REVISION_CREATED",
  "CONSULTATION_FINALIZED",
  "CLINICAL_ADDENDUM_CREATED",
]);

export const appointmentStatus = pgEnum("appointment_status", [
  "SCHEDULED",
  "ARRIVED",
  "IN_CONSULTATION",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const consultationStatus = pgEnum("consultation_status", ["IN_PROGRESS", "FINALIZED"]);

export const patientNumberSequence = pgSequence("patient_number_seq", {
  startWith: 1,
  increment: 1,
});

export const user = pgTable(
  "auth_user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: staffRole("role").notNull(),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_user_email_lower_unique").on(sql`lower(${table.email})`),
    uniqueIndex("auth_user_single_doctor_unique")
      .on(table.role)
      .where(sql`${table.role} = 'DOCTOR'`),
    index("auth_user_role_active_idx").on(table.role, table.active),
    check("auth_user_email_normalized_check", sql`${table.email} = lower(btrim(${table.email}))`),
  ],
);

export const session = pgTable(
  "auth_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ...timestamps,
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("auth_session_token_unique").on(table.token),
    index("auth_session_user_id_idx").on(table.userId),
    index("auth_session_expires_at_idx").on(table.expiresAt),
  ],
);

export const account = pgTable(
  "auth_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("auth_account_issuer_account_id_unique").on(table.issuer, table.accountId),
    index("auth_account_user_id_idx").on(table.userId),
    check(
      "auth_account_credential_password_check",
      sql`${table.providerId} <> 'credential' OR ${table.password} IS NOT NULL`,
    ),
  ],
);

export const verification = pgTable(
  "auth_verification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("auth_verification_identifier_idx").on(table.identifier),
    index("auth_verification_expires_at_idx").on(table.expiresAt),
  ],
);

export const rateLimit = pgTable(
  "auth_rate_limit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("auth_rate_limit_key_unique").on(table.key),
    index("auth_rate_limit_last_request_idx").on(table.lastRequest),
    check("auth_rate_limit_count_positive_check", sql`${table.count} > 0`),
  ],
);

export const loginThrottle = pgTable(
  "login_throttle",
  {
    keyHash: text("key_hash").primaryKey(),
    failedAttempts: integer("failed_attempts").default(0).notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("login_throttle_blocked_until_idx").on(table.blockedUntil),
    index("login_throttle_updated_at_idx").on(table.updatedAt),
    check("login_throttle_key_hash_length_check", sql`length(${table.keyHash}) = 64`),
    check("login_throttle_failed_attempts_check", sql`${table.failedAttempts} >= 0`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: auditAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, string | number | boolean | null | readonly string[]>>()
      .notNull(),
  },
  (table) => [
    index("audit_log_actor_occurred_at_idx").on(table.actorUserId, table.occurredAt),
    index("audit_log_action_occurred_at_idx").on(table.action, table.occurredAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    check("audit_log_entity_type_nonempty_check", sql`length(btrim(${table.entityType})) > 0`),
    check("audit_log_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);

export const patient = pgTable(
  "patient",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientNumber: text("patient_number")
      .default(sql`'P-' || lpad(nextval('patient_number_seq')::text, 6, '0')`)
      .notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    email: text("email"),
    address: text("address"),
    emergencyContactName: text("emergency_contact_name"),
    emergencyContactPhone: text("emergency_contact_phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("patient_patient_number_unique").on(table.patientNumber),
    index("patient_active_name_idx")
      .on(table.lastName, table.firstName, table.patientNumber)
      .where(sql`${table.archivedAt} IS NULL`),
    index("patient_phone_normalized_idx").on(table.phoneNormalized),
    index("patient_email_lower_idx").on(sql`lower(${table.email})`),
    index("patient_archived_at_idx").on(table.archivedAt),
    check("patient_number_format_check", sql`${table.patientNumber} ~ '^P-[0-9]{6,}$'`),
    check(
      "patient_first_name_check",
      sql`length(btrim(${table.firstName})) BETWEEN 1 AND 100 AND ${table.firstName} = btrim(${table.firstName})`,
    ),
    check(
      "patient_last_name_check",
      sql`length(btrim(${table.lastName})) BETWEEN 1 AND 100 AND ${table.lastName} = btrim(${table.lastName})`,
    ),
    check("patient_date_of_birth_check", sql`${table.dateOfBirth} <= CURRENT_DATE`),
    check(
      "patient_phone_length_check",
      sql`${table.phone} IS NULL OR length(${table.phone}) <= 32`,
    ),
    check(
      "patient_phone_normalized_check",
      sql`${table.phoneNormalized} IS NULL OR ${table.phoneNormalized} ~ '^\\+?[0-9]{5,20}$'`,
    ),
    check(
      "patient_phone_pair_check",
      sql`(${table.phone} IS NULL) = (${table.phoneNormalized} IS NULL)`,
    ),
    check(
      "patient_email_check",
      sql`${table.email} IS NULL OR (length(${table.email}) <= 254 AND ${table.email} = lower(btrim(${table.email})))`,
    ),
    check(
      "patient_address_length_check",
      sql`${table.address} IS NULL OR length(${table.address}) <= 500`,
    ),
    check(
      "patient_emergency_name_length_check",
      sql`${table.emergencyContactName} IS NULL OR length(${table.emergencyContactName}) <= 100`,
    ),
    check(
      "patient_emergency_phone_length_check",
      sql`${table.emergencyContactPhone} IS NULL OR length(${table.emergencyContactPhone}) <= 32`,
    ),
    check("patient_version_positive_check", sql`${table.version} >= 1`),
    check(
      "patient_archive_pair_check",
      sql`(${table.archivedAt} IS NULL) = (${table.archivedBy} IS NULL)`,
    ),
  ],
);

export const appointment = pgTable(
  "appointment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
    scheduledEnd: timestamp("scheduled_end", { withTimezone: true }).notNull(),
    status: appointmentStatus("status").default("SCHEDULED").notNull(),
    administrativeReason: text("administrative_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("appointment_scheduled_start_idx").on(table.scheduledStart),
    index("appointment_patient_start_idx").on(table.patientId, table.scheduledStart),
    index("appointment_status_start_idx").on(table.status, table.scheduledStart),
    check("appointment_time_order_check", sql`${table.scheduledEnd} > ${table.scheduledStart}`),
    check("appointment_version_positive_check", sql`${table.version} >= 1`),
    check(
      "appointment_reason_length_check",
      sql`${table.administrativeReason} IS NULL OR length(${table.administrativeReason}) <= 160`,
    ),
    check(
      "appointment_cancellation_metadata_check",
      sql`(${table.status} = 'CANCELLED') = (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
  ],
);

export const consultation = pgTable(
  "consultation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointment.id, {
      onDelete: "restrict",
    }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: consultationStatus("status").default("IN_PROGRESS").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalRevisionId: uuid("final_revision_id"),
    revisionCount: integer("revision_count").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultation_appointment_unique").on(table.appointmentId),
    index("consultation_patient_started_idx").on(table.patientId, table.startedAt),
    index("consultation_status_started_idx").on(table.status, table.startedAt),
    index("consultation_doctor_started_idx").on(table.doctorId, table.startedAt),
    check("consultation_version_positive_check", sql`${table.version} >= 1`),
    check("consultation_revision_count_check", sql`${table.revisionCount} >= 0`),
    check(
      "consultation_finalization_state_check",
      sql`(${table.status} = 'IN_PROGRESS' AND ${table.finalizedAt} IS NULL AND ${table.finalRevisionId} IS NULL) OR (${table.status} = 'FINALIZED' AND ${table.finalizedAt} IS NOT NULL AND ${table.finalRevisionId} IS NOT NULL)`,
    ),
  ],
);

export const clinicalNoteRevision = pgTable(
  "clinical_note_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultation.id, { onDelete: "restrict" }),
    revisionNumber: integer("revision_number").notNull(),
    reasonForVisit: text("reason_for_visit"),
    observations: text("observations"),
    diagnosis: text("diagnosis"),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("clinical_note_revision_number_unique").on(
      table.consultationId,
      table.revisionNumber,
    ),
    uniqueIndex("clinical_note_revision_consultation_id_unique").on(table.consultationId, table.id),
    index("clinical_note_revision_created_at_idx").on(table.consultationId, table.createdAt),
    check("clinical_note_revision_number_positive_check", sql`${table.revisionNumber} >= 1`),
    check(
      "clinical_note_revision_content_check",
      sql`${table.reasonForVisit} IS NOT NULL OR ${table.observations} IS NOT NULL OR ${table.diagnosis} IS NOT NULL OR ${table.notes} IS NOT NULL`,
    ),
    check(
      "clinical_note_revision_reason_length_check",
      sql`${table.reasonForVisit} IS NULL OR length(${table.reasonForVisit}) <= 2000`,
    ),
    check(
      "clinical_note_revision_observations_length_check",
      sql`${table.observations} IS NULL OR length(${table.observations}) <= 10000`,
    ),
    check(
      "clinical_note_revision_diagnosis_length_check",
      sql`${table.diagnosis} IS NULL OR length(${table.diagnosis}) <= 4000`,
    ),
    check(
      "clinical_note_revision_notes_length_check",
      sql`${table.notes} IS NULL OR length(${table.notes}) <= 20000`,
    ),
  ],
);

export const clinicalNoteAddendum = pgTable(
  "clinical_note_addendum",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultation.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("clinical_note_addendum_consultation_created_idx").on(
      table.consultationId,
      table.createdAt,
    ),
    check(
      "clinical_note_addendum_content_check",
      sql`length(btrim(${table.content})) BETWEEN 1 AND 20000`,
    ),
  ],
);

export const authSchema = { user, session, account, verification, rateLimit };
