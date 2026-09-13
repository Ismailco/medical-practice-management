import { beforeEach } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as addendumRoute } from "@/app/api/consultations/[id]/addenda/route";
import { POST as finalizeConsultationRoute } from "@/app/api/consultations/[id]/finalize/route";
import { POST as saveRevisionRoute } from "@/app/api/consultations/[id]/revisions/route";
import { GET as getConsultation } from "@/app/api/consultations/[id]/route";
import { POST as startFromAppointmentRoute } from "@/app/api/consultations/from-appointment/route";
import {
  GET as listConsultationsRoute,
  POST as startDirectRoute,
} from "@/app/api/consultations/route";
import { POST as cancelFollowUpRoute } from "@/app/api/follow-ups/[id]/cancel/route";
import { POST as completeFollowUpRoute } from "@/app/api/follow-ups/[id]/complete/route";
import { GET as getFollowUpRoute } from "@/app/api/follow-ups/[id]/route";
import { POST as updateFollowUpRoute } from "@/app/api/follow-ups/[id]/update/route";
import { GET as listFollowUpsRoute, POST as createFollowUpRoute } from "@/app/api/follow-ups/route";
import { POST as discardPrescriptionRoute } from "@/app/api/prescriptions/[id]/discard/route";
import { POST as duplicatePrescriptionRoute } from "@/app/api/prescriptions/[id]/duplicate/route";
import { POST as finalizePrescriptionRoute } from "@/app/api/prescriptions/[id]/finalize/route";
import { GET as getPrescriptionRoute } from "@/app/api/prescriptions/[id]/route";
import { POST as replacePrescriptionRoute } from "@/app/api/prescriptions/[id]/replace/route";
import { POST as savePrescriptionRoute } from "@/app/api/prescriptions/[id]/save/route";
import { POST as voidPrescriptionRoute } from "@/app/api/prescriptions/[id]/void/route";
import { POST as generatePrescriptionPdfRoute } from "@/app/api/prescriptions/[id]/pdf/route";
import {
  GET as listPrescriptionsRoute,
  POST as createPrescriptionRoute,
} from "@/app/api/prescriptions/route";
import { PATCH as savePracticeProfileRoute } from "@/app/api/settings/practice/route";
import {
  GET as getAppointment,
  PATCH as rescheduleAppointmentRoute,
} from "@/app/api/appointments/[id]/route";
import { PATCH as transitionAppointmentRoute } from "@/app/api/appointments/[id]/transition/route";
import {
  GET as listAppointments,
  POST as createAppointmentRoute,
} from "@/app/api/appointments/route";
import { GET as getPatient, PATCH as updatePatientRoute } from "@/app/api/patients/[id]/route";
import { PATCH as changePatientLifecycle } from "@/app/api/patients/[id]/lifecycle/route";
import { GET as listPatients, POST as createPatientRoute } from "@/app/api/patients/route";
import { POST as searchPatients } from "@/app/api/patients/search/route";
import { GET as listUsers, POST as createUser } from "@/app/api/settings/users/route";
import { PATCH as updateUser } from "@/app/api/settings/users/[id]/route";
import { db } from "@/db/client";
import {
  account,
  appointment,
  auditLog,
  clinicalNoteAddendum,
  clinicalNoteRevision,
  consultation,
  followUp,
  loginThrottle,
  patient,
  prescription,
  prescriptionCounter,
  prescriptionIssueSnapshot,
  prescriptionItem,
  session,
  user,
} from "@/db/schema";
import { getCurrentSession } from "@/modules/auth/session";
import { listPatientAppointments } from "@/modules/appointments/repository";
import { clinicToday, nextCalendarDate } from "@/modules/appointments/timezone";
import {
  addClinicalAddendum,
  finalizeConsultation,
  saveClinicalNoteRevision,
  startConsultationFromAppointment,
  startDirectConsultation,
} from "@/modules/consultations/service";
import { listOperationalFollowUps } from "@/modules/follow-ups/repository";
import { findPrescriptionDetail } from "@/modules/prescriptions/repository";
import {
  createPrescriptionDraft,
  createReplacementPrescription,
  duplicatePrescription,
  finalizePrescription,
  savePrescriptionDraft,
  savePracticeProfile,
  voidPrescription,
} from "@/modules/prescriptions/service";
import {
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  updatePendingFollowUp,
} from "@/modules/follow-ups/service";
import { searchAdministrativePatients } from "@/modules/patients/repository";
import {
  changePatientArchiveState,
  createPatient,
  updatePatientAdministrativeData,
} from "@/modules/patients/service";
import { createInitialDoctor, createSecretary, resetDoctorPassword } from "@/modules/users/service";
import { env } from "@/config/env";
import { resetDatabase } from "./integration-database";

export const origin = new URL(env.APP_URL).origin;
export const doctorPassword = "Synthetic doctor passphrase 2026";
export const secretaryPassword = "Synthetic secretary passphrase 2026";

export type StaffFixture = Readonly<{ id: string; email: string }>;

export let doctor: StaffFixture;
export let secretary: StaffFixture;

export function request(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; origin?: string; ip?: string } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: options.origin ?? origin,
    "x-forwarded-for": options.ip ?? "192.0.2.10",
  });
  if (options.cookie) headers.set("cookie", options.cookie);

  return new Request(new URL(path, env.APP_URL), {
    method: options.method ?? "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

export function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

export async function signIn(email: string, password: string, ip = "192.0.2.10") {
  const response = await login(request("/api/auth/login", { body: { email, password }, ip }));
  return { response, cookie: cookieHeader(response) };
}

export function patientInput(suffix = "One") {
  return {
    firstName: `Synthetic ${suffix}`,
    lastName: "Patient",
    dateOfBirth: "1990-04-12",
    phone: "+212 600 000 001",
    email: `synthetic-${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@example.test`,
    address: `Synthetic address ${suffix}`,
    emergencyContactName: `Synthetic Contact ${suffix}`,
    emergencyContactPhone: "+33 1 23 45 67 89",
  };
}

export function patientContext(patientId: string) {
  return { params: Promise.resolve({ id: patientId }) };
}

export function appointmentContext(appointmentId: string) {
  return { params: Promise.resolve({ id: appointmentId }) };
}

export function appointmentInput(patientId: string, overrides: Record<string, unknown> = {}) {
  return {
    patientId,
    localDate: "2090-09-10",
    localStartTime: "09:00",
    durationMinutes: 30,
    administrativeReason: "Synthetic administrative visit",
    ...overrides,
  };
}

export async function responseAppointmentId(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("appointment" in body) ||
    !body.appointment ||
    typeof body.appointment !== "object" ||
    !("id" in body.appointment) ||
    typeof body.appointment.id !== "string"
  ) {
    throw new Error("Expected an appointment response.");
  }
  return body.appointment.id;
}

export function consultationContext(consultationId: string) {
  return { params: Promise.resolve({ id: consultationId }) };
}

export function doctorActor() {
  return {
    id: doctor.id,
    name: "Synthetic Doctor",
    email: doctor.email,
    role: "DOCTOR" as const,
  };
}

export async function responseConsultationId(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("consultation" in body) ||
    !body.consultation ||
    typeof body.consultation !== "object" ||
    !("id" in body.consultation) ||
    typeof body.consultation.id !== "string"
  ) {
    throw new Error("Expected a consultation response.");
  }
  return body.consultation.id;
}

export const privateClinicalFields = {
  reasonForVisit: "TEST_REASON_PRIVATE_11223",
  observations: "TEST_OBSERVATION_PRIVATE_33445",
  diagnosis: "TEST_DIAGNOSIS_PRIVATE_94821",
  notes: 'TEST_NOTE_PRIVATE_58392 <script>alert("clinical")</script>',
};

export function followUpContext(followUpId: string) {
  return { params: Promise.resolve({ id: followUpId }) };
}

export async function responseFollowUpId(response: Response): Promise<string> {
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("followUp" in body) ||
    !body.followUp ||
    typeof body.followUp !== "object" ||
    !("id" in body.followUp) ||
    typeof body.followUp.id !== "string"
  ) {
    throw new Error("Expected a follow-up response.");
  }
  return body.followUp.id;
}

export async function responsePdfText(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  return [...bytes.toString("latin1").matchAll(/<([0-9a-f]+)>/g)]
    .map((match) => (match[1] ? Buffer.from(match[1], "hex").toString("latin1") : ""))
    .join("");
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const privateFollowUpReason =
  'TEST_FOLLOWUP_PRIVATE_72194 <script>alert("follow-up")</script>';

export function prescriptionContext(prescriptionId: string) {
  return { params: Promise.resolve({ id: prescriptionId }) };
}

export async function configurePracticeProfile(
  name = "Synthetic Clinic A",
  doctorName = "Dr. Synthetic",
) {
  return savePracticeProfile(
    {
      clinic: {
        name,
        address: "Synthetic clinic address",
        phone: "+212600000099",
        expectedVersion: null,
      },
      doctor: {
        displayName: doctorName,
        specialty: "General practice",
        professionalIdentifier: "SYN-001",
        expectedVersion: null,
      },
    },
    doctorActor(),
  );
}

export const privatePrescriptionItems = [
  {
    medicationName: "TEST_MEDICATION_PRIVATE_78123 <script>alert(1)</script>",
    dosage: "TEST_DOSAGE_PRIVATE_91274",
    form: "tablet",
    frequency: "once daily",
    duration: "7 days",
    quantity: "7",
    route: "oral",
    instructions: "TEST_INSTRUCTION_PRIVATE_63182",
  },
];

export function setupIntegrationFixtures(): void {
  beforeEach(async () => {
    await resetDatabase();
    doctor = await createInitialDoctor({
      name: "Synthetic Doctor",
      email: "doctor@example.test",
      password: doctorPassword,
    });
    secretary = await createSecretary(
      {
        name: "Synthetic Secretary",
        email: "secretary@example.test",
        password: secretaryPassword,
      },
      doctor.id,
    );
  });
}

export {
  login,
  logout,
  addendumRoute,
  finalizeConsultationRoute,
  saveRevisionRoute,
  getConsultation,
  startFromAppointmentRoute,
  listConsultationsRoute,
  startDirectRoute,
  cancelFollowUpRoute,
  completeFollowUpRoute,
  getFollowUpRoute,
  updateFollowUpRoute,
  listFollowUpsRoute,
  createFollowUpRoute,
  discardPrescriptionRoute,
  duplicatePrescriptionRoute,
  finalizePrescriptionRoute,
  getPrescriptionRoute,
  replacePrescriptionRoute,
  savePrescriptionRoute,
  voidPrescriptionRoute,
  generatePrescriptionPdfRoute,
  listPrescriptionsRoute,
  createPrescriptionRoute,
  savePracticeProfileRoute,
  getAppointment,
  rescheduleAppointmentRoute,
  transitionAppointmentRoute,
  listAppointments,
  createAppointmentRoute,
  getPatient,
  updatePatientRoute,
  changePatientLifecycle,
  listPatients,
  createPatientRoute,
  searchPatients,
  listUsers,
  createUser,
  updateUser,
  db,
  account,
  appointment,
  auditLog,
  clinicalNoteAddendum,
  clinicalNoteRevision,
  consultation,
  followUp,
  loginThrottle,
  patient,
  prescription,
  prescriptionCounter,
  prescriptionIssueSnapshot,
  prescriptionItem,
  session,
  user,
  getCurrentSession,
  listPatientAppointments,
  clinicToday,
  nextCalendarDate,
  addClinicalAddendum,
  finalizeConsultation,
  saveClinicalNoteRevision,
  startConsultationFromAppointment,
  startDirectConsultation,
  listOperationalFollowUps,
  findPrescriptionDetail,
  createPrescriptionDraft,
  createReplacementPrescription,
  duplicatePrescription,
  finalizePrescription,
  savePrescriptionDraft,
  savePracticeProfile,
  voidPrescription,
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  updatePendingFollowUp,
  searchAdministrativePatients,
  changePatientArchiveState,
  createPatient,
  updatePatientAdministrativeData,
  createInitialDoctor,
  createSecretary,
  resetDoctorPassword,
};
