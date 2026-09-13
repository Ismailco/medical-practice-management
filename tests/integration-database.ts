import { db, sqlClient } from "@/db/client";
import { prescriptionCounter } from "@/db/schema";
import { assertDestructiveTestDatabaseAllowed } from "./database-reset-safety";

export async function resetDatabase(): Promise<void> {
  assertDestructiveTestDatabaseAllowed(process.env);
  await sqlClient`
    TRUNCATE TABLE
      audit_log,
      prescription_issue_snapshot,
      prescription_item,
      prescription,
      doctor_professional_profile,
      clinic_profile,
      prescription_counter,
      follow_up,
      clinical_note_addendum,
      clinical_note_revision,
      consultation,
      appointment,
      patient,
      login_throttle,
      auth_rate_limit,
      auth_verification,
      auth_session,
      auth_account,
      auth_user
    RESTART IDENTITY CASCADE
  `;
  await db.insert(prescriptionCounter).values({ id: 1, nextNumber: 1 });
}
