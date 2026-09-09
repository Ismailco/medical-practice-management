import { env } from "@/config/env";
import { db, sqlClient } from "@/db/client";
import { prescriptionCounter } from "@/db/schema";
import { assertDestructiveTestDatabaseAllowed } from "../database-reset-safety";
import { createInitialDoctor, createSecretary } from "@/modules/users/service";
import { savePracticeProfile } from "@/modules/prescriptions/service";

export const doctorCredentials = {
  email: "e2e.doctor@example.test",
  password: "E2eDoctorPassword-2026!",
};
export const secretaryCredentials = {
  email: "e2e.secretary@example.test",
  password: "E2eSecretaryPassword-2026!",
};

async function main() {
  assertDestructiveTestDatabaseAllowed(process.env);
  await sqlClient`TRUNCATE TABLE audit_log, prescription_issue_snapshot, prescription_item, prescription, prescription_counter, follow_up, clinical_note_addendum, clinical_note_revision, consultation, appointment, patient, clinic_profile, doctor_professional_profile, auth_session, auth_account, auth_user, login_throttle RESTART IDENTITY CASCADE`;
  await db.insert(prescriptionCounter).values({ id: 1, nextNumber: 1 });
  const doctor = await createInitialDoctor({ name: "E2E Doctor", ...doctorCredentials });
  await createSecretary({ name: "E2E Secretary", ...secretaryCredentials }, doctor.id);
  await savePracticeProfile(
    {
      clinic: {
        name: "E2E Clinic",
        address: "1 Test Road",
        phone: "+212 500 000 000",
        expectedVersion: null,
      },
      doctor: {
        displayName: "Dr. E2E Doctor",
        specialty: "General practice",
        professionalIdentifier: "E2E-001",
        expectedVersion: null,
      },
    },
    { id: doctor.id, role: "DOCTOR", email: doctor.email, name: doctor.name },
  );
  console.log(`Prepared isolated test database ${new URL(env.DATABASE_URL).pathname.slice(1)}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "E2E preparation failed safely.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end({ timeout: 5 });
  });
