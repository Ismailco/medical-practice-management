import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
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
  "FOLLOW_UP_CREATED",
  "FOLLOW_UP_UPDATED",
  "FOLLOW_UP_COMPLETED",
  "FOLLOW_UP_CANCELLED",
  "PRESCRIPTION_DRAFT_CREATED",
  "PRESCRIPTION_DRAFT_UPDATED",
  "PRESCRIPTION_DRAFT_DISCARDED",
  "PRESCRIPTION_FINALIZED",
  "PRESCRIPTION_VOIDED",
  "PRESCRIPTION_DUPLICATED",
  "PRESCRIPTION_REPLACEMENT_DRAFT_CREATED",
  "PRESCRIPTION_PDF_GENERATED",
  "PRACTICE_PROFILE_UPDATED",
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
export const followUpStatus = pgEnum("follow_up_status", ["PENDING", "COMPLETED", "CANCELLED"]);
export const prescriptionStatus = pgEnum("prescription_status", ["DRAFT", "FINALIZED", "VOID"]);

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
    uniqueIndex("consultation_patient_id_unique").on(table.patientId, table.id),
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

export const followUp = pgTable(
  "follow_up",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    consultationId: uuid("consultation_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    status: followUpStatus("status").default("PENDING").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => user.id, { onDelete: "restrict" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => user.id, { onDelete: "restrict" }),
    ...timestamps,
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.patientId, table.consultationId],
      foreignColumns: [consultation.patientId, consultation.id],
      name: "follow_up_consultation_patient_fk",
    }).onDelete("restrict"),
    index("follow_up_status_due_date_idx").on(table.status, table.dueDate),
    index("follow_up_patient_due_date_idx").on(table.patientId, table.dueDate),
    index("follow_up_consultation_idx").on(table.consultationId),
    check("follow_up_version_positive_check", sql`${table.version} >= 1`),
    check(
      "follow_up_reason_check",
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 2000 AND ${table.reason} = btrim(${table.reason})`,
    ),
    check(
      "follow_up_lifecycle_metadata_check",
      sql`(${table.status} = 'PENDING' AND ${table.completedAt} IS NULL AND ${table.completedBy} IS NULL AND ${table.cancelledAt} IS NULL AND ${table.cancelledBy} IS NULL) OR (${table.status} = 'COMPLETED' AND ${table.completedAt} IS NOT NULL AND ${table.completedBy} IS NOT NULL AND ${table.cancelledAt} IS NULL AND ${table.cancelledBy} IS NULL) OR (${table.status} = 'CANCELLED' AND ${table.completedAt} IS NULL AND ${table.completedBy} IS NULL AND ${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL)`,
    ),
  ],
);

export const prescriptionCounter = pgTable("prescription_counter", {
  id: integer("id").primaryKey(),
  nextNumber: integer("next_number").notNull(),
});

export const clinicProfile = pgTable(
  "clinic_profile",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    check("clinic_profile_singleton_check", sql`${table.id} = 1`),
    check("clinic_profile_name_check", sql`length(btrim(${table.name})) BETWEEN 1 AND 200`),
    check(
      "clinic_profile_address_check",
      sql`${table.address} IS NULL OR length(${table.address}) <= 500`,
    ),
    check(
      "clinic_profile_phone_check",
      sql`${table.phone} IS NULL OR length(${table.phone}) <= 50`,
    ),
    check("clinic_profile_version_positive_check", sql`${table.version} >= 1`),
  ],
);

export const doctorProfessionalProfile = pgTable(
  "doctor_professional_profile",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    specialty: text("specialty"),
    professionalIdentifier: text("professional_identifier"),
    version: integer("version").default(1).notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "doctor_profile_display_name_check",
      sql`length(btrim(${table.displayName})) BETWEEN 1 AND 200`,
    ),
    check(
      "doctor_profile_specialty_check",
      sql`${table.specialty} IS NULL OR length(${table.specialty}) <= 200`,
    ),
    check(
      "doctor_profile_identifier_check",
      sql`${table.professionalIdentifier} IS NULL OR length(${table.professionalIdentifier}) <= 200`,
    ),
    check("doctor_profile_version_positive_check", sql`${table.version} >= 1`),
  ],
);

export const prescription = pgTable(
  "prescription",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patient.id, { onDelete: "restrict" }),
    consultationId: uuid("consultation_id"),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: prescriptionStatus("status").default("DRAFT").notNull(),
    prescriptionNumber: text("prescription_number"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    issueDate: date("issue_date", { mode: "string" }),
    replacesPrescriptionId: uuid("replaces_prescription_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => user.id, { onDelete: "restrict" }),
    ...timestamps,
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.patientId, table.consultationId],
      foreignColumns: [consultation.patientId, consultation.id],
      name: "prescription_consultation_patient_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.patientId, table.replacesPrescriptionId],
      foreignColumns: [table.patientId, table.id],
      name: "prescription_replacement_patient_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.replacesPrescriptionId],
      foreignColumns: [table.id],
      name: "prescription_replaces_prescription_id_prescription_id_fk",
    }).onDelete("restrict"),
    uniqueIndex("prescription_patient_id_unique").on(table.patientId, table.id),
    uniqueIndex("prescription_number_unique").on(table.prescriptionNumber),
    uniqueIndex("prescription_issued_replacement_unique")
      .on(table.replacesPrescriptionId)
      .where(
        sql`${table.status} IN ('FINALIZED', 'VOID') AND ${table.replacesPrescriptionId} IS NOT NULL`,
      ),
    index("prescription_patient_created_idx").on(table.patientId, table.createdAt),
    index("prescription_status_created_idx").on(table.status, table.createdAt),
    index("prescription_consultation_idx").on(table.consultationId),
    index("prescription_replacement_idx").on(table.replacesPrescriptionId),
    check("prescription_version_positive_check", sql`${table.version} >= 1`),
    check(
      "prescription_number_format_check",
      sql`${table.prescriptionNumber} IS NULL OR ${table.prescriptionNumber} ~ '^RX-[0-9]{6,}$'`,
    ),
    check(
      "prescription_state_metadata_check",
      sql`(${table.status} = 'DRAFT' AND ${table.prescriptionNumber} IS NULL AND ${table.issuedAt} IS NULL AND ${table.issueDate} IS NULL AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL) OR (${table.status} = 'FINALIZED' AND ${table.prescriptionNumber} IS NOT NULL AND ${table.issuedAt} IS NOT NULL AND ${table.issueDate} IS NOT NULL AND ${table.voidedAt} IS NULL AND ${table.voidedBy} IS NULL) OR (${table.status} = 'VOID' AND ${table.prescriptionNumber} IS NOT NULL AND ${table.issuedAt} IS NOT NULL AND ${table.issueDate} IS NOT NULL AND ${table.voidedAt} IS NOT NULL AND ${table.voidedBy} IS NOT NULL)`,
    ),
  ],
);

export const prescriptionItem = pgTable(
  "prescription_item",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prescriptionId: uuid("prescription_id")
      .notNull()
      .references(() => prescription.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    medicationName: text("medication_name").notNull(),
    dosage: text("dosage"),
    form: text("form"),
    frequency: text("frequency"),
    duration: text("duration"),
    quantity: text("quantity"),
    route: text("route"),
    instructions: text("instructions"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("prescription_item_position_unique").on(table.prescriptionId, table.position),
    index("prescription_item_prescription_idx").on(table.prescriptionId, table.position),
    check("prescription_item_position_check", sql`${table.position} >= 0`),
    check(
      "prescription_item_medication_name_check",
      sql`length(btrim(${table.medicationName})) BETWEEN 1 AND 200`,
    ),
    check(
      "prescription_item_dosage_check",
      sql`${table.dosage} IS NULL OR length(${table.dosage}) <= 200`,
    ),
    check(
      "prescription_item_form_check",
      sql`${table.form} IS NULL OR length(${table.form}) <= 100`,
    ),
    check(
      "prescription_item_frequency_check",
      sql`${table.frequency} IS NULL OR length(${table.frequency}) <= 200`,
    ),
    check(
      "prescription_item_duration_check",
      sql`${table.duration} IS NULL OR length(${table.duration}) <= 200`,
    ),
    check(
      "prescription_item_quantity_check",
      sql`${table.quantity} IS NULL OR length(${table.quantity}) <= 100`,
    ),
    check(
      "prescription_item_route_check",
      sql`${table.route} IS NULL OR length(${table.route}) <= 100`,
    ),
    check(
      "prescription_item_instructions_check",
      sql`${table.instructions} IS NULL OR length(${table.instructions}) <= 1000`,
    ),
  ],
);

export const prescriptionIssueSnapshot = pgTable(
  "prescription_issue_snapshot",
  {
    prescriptionId: uuid("prescription_id")
      .primaryKey()
      .references(() => prescription.id, { onDelete: "restrict" }),
    patientNumber: text("patient_number").notNull(),
    patientName: text("patient_name").notNull(),
    patientDateOfBirth: date("patient_date_of_birth", { mode: "string" }).notNull(),
    doctorName: text("doctor_name").notNull(),
    doctorSpecialty: text("doctor_specialty"),
    doctorProfessionalIdentifier: text("doctor_professional_identifier"),
    clinicName: text("clinic_name").notNull(),
    clinicAddress: text("clinic_address"),
    clinicPhone: text("clinic_phone"),
    templateVersion: text("template_version").notNull().default("phase6-v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "prescription_snapshot_patient_number_check",
      sql`length(btrim(${table.patientNumber})) > 0`,
    ),
    check("prescription_snapshot_patient_name_check", sql`length(btrim(${table.patientName})) > 0`),
    check("prescription_snapshot_doctor_name_check", sql`length(btrim(${table.doctorName})) > 0`),
    check("prescription_snapshot_clinic_name_check", sql`length(btrim(${table.clinicName})) > 0`),
  ],
);

export const authSchema = { user, session, account, verification, rateLimit };
