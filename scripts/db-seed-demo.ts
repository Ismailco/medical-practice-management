import { env } from "@/config/env";
import { db, sqlClient } from "@/db/client";
import { user } from "@/db/schema";
import { clinicToday, nextCalendarDate } from "@/modules/appointments/timezone";
import { createAppointment, transitionAppointmentStatus } from "@/modules/appointments/service";
import {
  startDirectConsultation,
  saveClinicalNoteRevision,
  finalizeConsultation,
} from "@/modules/consultations/service";
import { createFollowUp } from "@/modules/follow-ups/service";
import { changePatientArchiveState, createPatient } from "@/modules/patients/service";
import {
  createPrescriptionDraft,
  savePrescriptionDraft,
  finalizePrescription,
  savePracticeProfile,
} from "@/modules/prescriptions/service";
import { createInitialDoctor, createSecretary } from "@/modules/users/service";

const doctorEmail = "demo.doctor@example.test";
const secretaryEmail = "demo.secretary@example.test";
const doctorPassword = "DemoDoctorPassword-2026!";
const secretaryPassword = "DemoSecretaryPassword-2026!";

function assertDemoSeedEnvironment() {
  if (env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding requires ALLOW_DEMO_SEED=true.");
  }
  const database = new URL(env.DATABASE_URL).pathname.slice(1).toLowerCase();
  if (!/(^|[_-])demo($|[_-])/i.test(database) && !database.endsWith("_test")) {
    throw new Error("Demo seeding requires a clearly isolated demo or _test database.");
  }
  if (["postgres", "clinic", "production", "staging"].includes(database)) {
    throw new Error("Demo seeding refuses shared or production-looking databases.");
  }
}

async function main() {
  assertDemoSeedEnvironment();
  const existing = await db.select({ id: user.id }).from(user).limit(1);
  if (existing.length > 0) {
    throw new Error("Demo seed expects an empty database; refusing to modify existing accounts.");
  }

  const doctor = await createInitialDoctor({
    name: "Demo Doctor",
    email: doctorEmail,
    password: doctorPassword,
  });
  await createSecretary(
    { name: "Demo Secretary", email: secretaryEmail, password: secretaryPassword },
    doctor.id,
  );
  await savePracticeProfile(
    {
      clinic: {
        name: "Synthetic Clinic",
        address: "1 Example Street",
        phone: "+212 500 000 000",
        expectedVersion: null,
      },
      doctor: {
        displayName: "Dr. Demo Doctor",
        specialty: "General practice",
        professionalIdentifier: "DEMO-DOCTOR-001",
        expectedVersion: null,
      },
    },
    { id: doctor.id, role: "DOCTOR", email: doctor.email, name: doctor.name },
  );

  const actor = { id: doctor.id, role: "DOCTOR" as const, email: doctor.email, name: doctor.name };
  const patients = [];
  for (let index = 1; index <= 12; index += 1) {
    patients.push(
      await createPatient(
        {
          firstName: index === 1 ? "Amélie" : `Demo${index}`,
          lastName: index === 1 ? "François" : "Patient",
          dateOfBirth: `198${index % 10}-0${(index % 9) + 1}-1${index % 9}`,
          phone: `+212 600 000 ${String(index).padStart(3, "0")}`,
          email: `patient${index}@example.test`,
          address: "Synthetic data only",
          emergencyContactName: null,
          emergencyContactPhone: null,
        },
        doctor.id,
      ),
    );
  }

  const primaryPatient = patients[0];
  const archivedPatient = patients[11];
  if (!primaryPatient || !archivedPatient) throw new Error("Demo patient fixture was incomplete.");

  const appointment = await createAppointment(
    {
      patientId: primaryPatient.id,
      localDate: nextCalendarDate(clinicToday()),
      localStartTime: "09:00",
      durationMinutes: 30,
      administrativeReason: "Synthetic demo visit",
      allowOverlap: false,
    },
    actor,
  );
  await transitionAppointmentStatus(
    appointment.id,
    { targetStatus: "ARRIVED", expectedVersion: appointment.version },
    actor,
  );
  const consultation = await startDirectConsultation({ patientId: primaryPatient.id }, actor);
  const revision = await saveClinicalNoteRevision(
    consultation.id,
    {
      expectedVersion: consultation.version,
      reasonForVisit: "Synthetic demo consultation",
      observations: "Synthetic observation",
      diagnosis: null,
      notes: null,
    },
    actor,
  );
  await finalizeConsultation(consultation.id, { expectedVersion: revision.version }, actor);
  await createFollowUp(
    { patientId: primaryPatient.id, dueDate: clinicToday(), reason: "Synthetic demo follow-up" },
    actor,
  );
  const draft = await createPrescriptionDraft({ patientId: primaryPatient.id }, actor);
  const saved = await savePrescriptionDraft(
    draft.id,
    {
      expectedVersion: draft.version,
      consultationId: consultation.id,
      items: [
        {
          medicationName: "SYNTHETIC_DEMO_MEDICATION",
          dosage: "once",
          form: "tablet",
          frequency: "daily",
          duration: "7 days",
          quantity: "7",
          route: "oral",
          instructions: "Synthetic documentation only",
        },
      ],
    },
    actor,
  );
  await finalizePrescription(draft.id, { expectedVersion: saved.version }, actor);
  await changePatientArchiveState(
    archivedPatient.id,
    { action: "archive", expectedVersion: archivedPatient.version },
    doctor.id,
  );

  console.log("Demo seed created synthetic accounts and 12 patients.");
  console.log(`Doctor: ${doctorEmail} / ${doctorPassword}`);
  console.log(`Secretary: ${secretaryEmail} / ${secretaryPassword}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed safely.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end({ timeout: 5 });
  });
