import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { db, sqlClient } from "@/db/client";
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
import { assertDestructiveTestDatabaseAllowed } from "./database-reset-safety";

const origin = "https://clinic.test";
const doctorPassword = "Synthetic doctor passphrase 2026";
const secretaryPassword = "Synthetic secretary passphrase 2026";

type StaffFixture = Readonly<{ id: string; email: string }>;

let doctor: StaffFixture;
let secretary: StaffFixture;

function request(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string;
    ip?: string;
  } = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    origin: options.origin ?? origin,
    "x-forwarded-for": options.ip ?? "192.0.2.10",
  });
  if (options.cookie) headers.set("cookie", options.cookie);

  return new Request(`${origin}${path}`, {
    method: options.method ?? "POST",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

async function signIn(email: string, password: string, ip = "192.0.2.10") {
  const response = await login(request("/api/auth/login", { body: { email, password }, ip }));
  return { response, cookie: cookieHeader(response) };
}

function patientInput(suffix = "One") {
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

function patientContext(patientId: string) {
  return { params: Promise.resolve({ id: patientId }) };
}

async function resetDatabase(): Promise<void> {
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

afterAll(async () => {
  await resetDatabase();
  await sqlClient.end();
});

describe("database-backed authentication", () => {
  it("logs in both roles and returns only a secure session cookie and safe session DTO", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.11");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.12");

    expect(doctorLogin.response.status).toBe(200);
    expect(secretaryLogin.response.status).toBe(200);
    expect(await doctorLogin.response.json()).toEqual({ ok: true });

    const setCookie = doctorLogin.response.headers.getSetCookie().join("; ");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=28800");
    expect(setCookie).not.toContain(doctorPassword);

    const current = await getCurrentSession(new Headers({ cookie: doctorLogin.cookie }));
    expect(current?.user).toEqual({
      id: doctor.id,
      name: "Synthetic Doctor",
      email: doctor.email,
      role: "DOCTOR",
    });
    expect(current).not.toHaveProperty("token");
    expect(current?.user).not.toHaveProperty("password");
    expect(await getCurrentSession(new Headers({ cookie: secretaryLogin.cookie }))).toMatchObject({
      user: { id: secretary.id, role: "SECRETARY" },
    });
  });

  it("uses indistinguishable failures and enforces CSRF origin validation", async () => {
    const badPassword = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.20");
    const unknownUser = await signIn(
      "unknown@example.test",
      "incorrect synthetic password",
      "192.0.2.21",
    );
    const crossOrigin = await login(
      request("/api/auth/login", {
        body: { email: doctor.email, password: doctorPassword },
        origin: "https://attacker.example",
        ip: "192.0.2.22",
      }),
    );

    expect(badPassword.response.status).toBe(401);
    expect(unknownUser.response.status).toBe(401);
    expect(await badPassword.response.json()).toEqual({ error: "Invalid credentials." });
    expect(await unknownUser.response.json()).toEqual({ error: "Invalid credentials." });
    expect(crossOrigin.status).toBe(401);
    expect(await crossOrigin.json()).toEqual({ error: "Invalid credentials." });
  });

  it("persists failed-login throttling and clears a non-blocked bucket after success", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failed = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.30");
      expect(failed.response.status).toBe(401);
    }
    const throttled = await signIn(doctor.email, "incorrect synthetic password", "192.0.2.30");
    expect(throttled.response.status).toBe(429);
    expect(await db.select().from(loginThrottle)).toHaveLength(1);

    const stillThrottled = await signIn(doctor.email, doctorPassword, "192.0.2.30");
    expect(stillThrottled.response.status).toBe(429);

    await signIn(doctor.email, "incorrect synthetic password", "192.0.2.31");
    const successful = await signIn(doctor.email, doctorPassword, "192.0.2.31");
    expect(successful.response.status).toBe(200);
    const remaining = await db.select().from(loginThrottle);
    expect(remaining).toHaveLength(1);
  });

  it("allows only doctors to create secretaries and rejects role injection and duplicates", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.40");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.41");
    const payload = {
      name: "Second Synthetic Secretary",
      email: "second@example.test",
      password: "Another synthetic passphrase 2026",
    };

    const forbidden = await createUser(
      request("/api/settings/users", { body: payload, cookie: secretaryLogin.cookie }),
    );
    expect(forbidden.status).toBe(403);

    const injected = await createUser(
      request("/api/settings/users", {
        body: { ...payload, role: "DOCTOR" },
        cookie: doctorLogin.cookie,
      }),
    );
    expect(injected.status).toBe(400);

    const created = await createUser(
      request("/api/settings/users", { body: payload, cookie: doctorLogin.cookie }),
    );
    expect(created.status).toBe(201);

    const duplicate = await createUser(
      request("/api/settings/users", { body: payload, cookie: doctorLogin.cookie }),
    );
    expect(duplicate.status).toBe(409);

    const listed = await listUsers(
      request("/api/settings/users", { method: "GET", cookie: doctorLogin.cookie }),
    );
    expect(listed.status).toBe(200);
    const doctors = await db.select().from(user).where(eq(user.role, "DOCTOR"));
    expect(doctors).toHaveLength(1);
  });

  it("invalidates sessions on disable and password reset, and supports re-enabling", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.50");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.51");
    const routeContext = { params: Promise.resolve({ id: secretary.id }) };

    const disabled = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "disable" },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(disabled.status).toBe(200);
    expect(await getCurrentSession(new Headers({ cookie: secretaryLogin.cookie }))).toBeNull();
    expect((await signIn(secretary.email, secretaryPassword, "192.0.2.52")).response.status).toBe(
      401,
    );

    const enabled = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "enable" },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(enabled.status).toBe(200);
    const enabledLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.53");
    expect(enabledLogin.response.status).toBe(200);

    const newPassword = "Replacement synthetic passphrase 2026";
    const reset = await updateUser(
      request(`/api/settings/users/${secretary.id}`, {
        method: "PATCH",
        body: { action: "reset_password", password: newPassword },
        cookie: doctorLogin.cookie,
      }),
      routeContext,
    );
    expect(reset.status).toBe(200);
    expect(await getCurrentSession(new Headers({ cookie: enabledLogin.cookie }))).toBeNull();
    expect((await signIn(secretary.email, secretaryPassword, "192.0.2.54")).response.status).toBe(
      401,
    );
    expect((await signIn(secretary.email, newPassword, "192.0.2.55")).response.status).toBe(200);
  });

  it("revokes logout and expired sessions", async () => {
    const loggedIn = await signIn(doctor.email, doctorPassword, "192.0.2.60");
    const loggedOut = await logout(
      request("/api/auth/logout", { cookie: loggedIn.cookie, ip: "192.0.2.60" }),
    );
    expect(loggedOut.status).toBe(204);
    expect(await getCurrentSession(new Headers({ cookie: loggedIn.cookie }))).toBeNull();

    const relogged = await signIn(doctor.email, doctorPassword, "192.0.2.61");
    await db
      .update(session)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(session.userId, doctor.id));
    expect(await getCurrentSession(new Headers({ cookie: relogged.cookie }))).toBeNull();
  });

  it("supports operator doctor recovery and revokes existing sessions", async () => {
    const loggedIn = await signIn(doctor.email, doctorPassword, "192.0.2.65");
    const replacement = "Recovered synthetic doctor passphrase 2026";

    await resetDoctorPassword({ email: doctor.email, password: replacement });

    expect(await getCurrentSession(new Headers({ cookie: loggedIn.cookie }))).toBeNull();
    expect((await signIn(doctor.email, doctorPassword, "192.0.2.66")).response.status).toBe(401);
    expect((await signIn(doctor.email, replacement, "192.0.2.67")).response.status).toBe(200);
  });

  it("records security events without secrets and enforces audit immutability", async () => {
    await signIn(doctor.email, doctorPassword, "192.0.2.70");
    await signIn(doctor.email, "incorrect synthetic password", "192.0.2.71");

    const events = await db.select().from(auditLog);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "USER_DOCTOR_BOOTSTRAPPED",
        "USER_SECRETARY_CREATED",
        "AUTH_LOGIN_SUCCEEDED",
        "AUTH_LOGIN_FAILED",
      ]),
    );
    expect(JSON.stringify(events)).not.toContain(doctorPassword);
    expect(JSON.stringify(events)).not.toContain("incorrect synthetic password");

    await expect(
      db
        .update(auditLog)
        .set({ entityType: "changed" })
        .where(and(eq(auditLog.entityType, "authentication"), sql`true`)),
    ).rejects.toThrow();
    expect(await db.select().from(auditLog).where(eq(auditLog.entityType, "changed"))).toHaveLength(
      0,
    );

    const credentials = await db
      .select({ password: account.password })
      .from(account)
      .where(eq(account.userId, doctor.id));
    expect(credentials[0]?.password).toMatch(/^\$argon2id\$/);
    expect(credentials[0]?.password).not.toBe(doctorPassword);
  });
});

describe("administrative patient workflows", () => {
  it("allows both roles to create, list, view, and update administrative records", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.80");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.81");

    const doctorCreate = await createPatientRoute(
      request("/api/patients", {
        body: patientInput("Doctor"),
        cookie: doctorLogin.cookie,
      }),
    );
    const secretaryCreate = await createPatientRoute(
      request("/api/patients", {
        body: patientInput("Secretary"),
        cookie: secretaryLogin.cookie,
      }),
    );
    expect(doctorCreate.status).toBe(201);
    expect(secretaryCreate.status).toBe(201);

    const [doctorPatient] = await db
      .select()
      .from(patient)
      .where(eq(patient.email, "synthetic-doctor@example.test"));
    const [secretaryPatient] = await db
      .select()
      .from(patient)
      .where(eq(patient.email, "synthetic-secretary@example.test"));
    if (!doctorPatient || !secretaryPatient) throw new Error("Expected both created patients.");

    const doctorUpdate = await updatePatientRoute(
      request(`/api/patients/${doctorPatient.id}`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { ...patientInput("Doctor"), address: null, expectedVersion: doctorPatient.version },
      }),
      patientContext(doctorPatient.id),
    );
    expect(doctorUpdate.status).toBe(200);

    const listed = await listPatients(
      request("/api/patients?page=1", { method: "GET", cookie: secretaryLogin.cookie }),
    );
    const searched = await searchPatients(
      request("/api/patients/search", {
        body: { q: "Secretary", page: 1, includeArchived: false },
        cookie: secretaryLogin.cookie,
      }),
    );
    const viewed = await getPatient(
      request(`/api/patients/${secretaryPatient.id}`, {
        method: "GET",
        cookie: secretaryLogin.cookie,
      }),
      patientContext(secretaryPatient.id),
    );
    expect(listed.status).toBe(200);
    expect(searched.status).toBe(200);
    expect(viewed.status).toBe(200);
    const viewBody = await viewed.text();
    expect(viewBody).not.toContain("phoneNormalized");
    expect(viewBody).not.toContain("archivedBy");

    const updated = await updatePatientRoute(
      request(`/api/patients/${secretaryPatient.id}`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: {
          ...patientInput("Secretary"),
          phone: "+212 611 111 111",
          expectedVersion: secretaryPatient.version,
        },
      }),
      patientContext(secretaryPatient.id),
    );
    expect(updated.status).toBe(200);
    expect(
      (await db.select().from(patient).where(eq(patient.id, secretaryPatient.id)))[0],
    ).toMatchObject({ phone: "+212 611 111 111", phoneNormalized: "+212611111111", version: 2 });
  });

  it("rejects every unauthenticated patient operation", async () => {
    const created = await createPatient(patientInput("Protected"), doctor.id);
    const context = patientContext(created.id);

    expect((await listPatients(request("/api/patients", { method: "GET" }))).status).toBe(401);
    expect(
      (
        await searchPatients(
          request("/api/patients/search", {
            body: { q: "Protected", page: 1, includeArchived: false },
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await getPatient(request(`/api/patients/${created.id}`, { method: "GET" }), context)).status,
    ).toBe(401);
    expect(
      (await createPatientRoute(request("/api/patients", { body: patientInput() }))).status,
    ).toBe(401);
    expect(
      (
        await updatePatientRoute(
          request(`/api/patients/${created.id}`, {
            method: "PATCH",
            body: { ...patientInput("Protected"), expectedVersion: 1 },
          }),
          context,
        )
      ).status,
    ).toBe(401);
    for (const action of ["archive", "restore"] as const) {
      expect(
        (
          await changePatientLifecycle(
            request(`/api/patients/${created.id}/lifecycle`, {
              method: "PATCH",
              body: { action, expectedVersion: 1 },
            }),
            context,
          )
        ).status,
      ).toBe(401);
    }
  });

  it("rejects attempts to supply identifiers, roles, or clinical fields", async () => {
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.82");
    const crossOrigin = await createPatientRoute(
      request("/api/patients", {
        cookie: secretaryLogin.cookie,
        origin: "https://attacker.example",
        body: patientInput("CrossOrigin"),
      }),
    );
    expect(crossOrigin.status).toBe(403);

    for (const field of ["patientNumber", "role", "diagnosis", "clinicalNotes", "prescriptions"]) {
      const response = await createPatientRoute(
        request("/api/patients", {
          cookie: secretaryLogin.cookie,
          body: { ...patientInput(field), [field]: "not accepted" },
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(await db.select().from(patient)).toHaveLength(0);

    const created = await createPatient(patientInput("StrictUpdate"), secretary.id);
    const injectedUpdate = await updatePatientRoute(
      request(`/api/patients/${created.id}`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: {
          ...patientInput("StrictUpdate"),
          expectedVersion: created.version,
          diagnosis: "not accepted",
        },
      }),
      patientContext(created.id),
    );
    expect(injectedUpdate.status).toBe(400);
    expect((await db.select().from(patient).where(eq(patient.id, created.id)))[0]?.version).toBe(1);
  });

  it("enforces doctor-only archive and restore and blocks archived edits", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.83");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.84");
    const created = await createPatient(patientInput("Lifecycle"), secretary.id);
    const context = patientContext(created.id);

    const secretaryArchive = await changePatientLifecycle(
      request(`/api/patients/${created.id}/lifecycle`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { action: "archive", expectedVersion: created.version },
      }),
      context,
    );
    expect(secretaryArchive.status).toBe(403);

    const archived = await changePatientLifecycle(
      request(`/api/patients/${created.id}/lifecycle`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { action: "archive", expectedVersion: created.version },
      }),
      context,
    );
    expect(archived.status).toBe(200);

    const archivedEdit = await updatePatientRoute(
      request(`/api/patients/${created.id}`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { ...patientInput("Changed"), expectedVersion: 2 },
      }),
      context,
    );
    expect(archivedEdit.status).toBe(409);

    const defaultSearch = await searchAdministrativePatients({
      q: "Lifecycle",
      page: 1,
      includeArchived: false,
    });
    const archivedSearch = await searchAdministrativePatients({
      q: "Lifecycle",
      page: 1,
      includeArchived: true,
    });
    expect(defaultSearch.total).toBe(0);
    expect(archivedSearch.total).toBe(1);

    const secretaryRestore = await changePatientLifecycle(
      request(`/api/patients/${created.id}/lifecycle`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { action: "restore", expectedVersion: 2 },
      }),
      context,
    );
    expect(secretaryRestore.status).toBe(403);

    const restored = await changePatientLifecycle(
      request(`/api/patients/${created.id}/lifecycle`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { action: "restore", expectedVersion: 2 },
      }),
      context,
    );
    expect(restored.status).toBe(200);
    expect((await db.select().from(patient).where(eq(patient.id, created.id)))[0]).toMatchObject({
      id: created.id,
      patientNumber: created.patientNumber,
      archivedAt: null,
      archivedBy: null,
      version: 3,
    });
  });

  it("prevents a stale concurrent update from overwriting the winner", async () => {
    const created = await createPatient(patientInput("Concurrent"), doctor.id);
    const firstInput = {
      ...patientInput("Concurrent"),
      phone: "+212 622 222 222",
      expectedVersion: created.version,
    };
    const staleInput = {
      ...patientInput("Concurrent"),
      phone: "+212 633 333 333",
      expectedVersion: created.version,
    };

    const winner = await updatePatientAdministrativeData(created.id, firstInput, doctor.id);
    await expect(
      updatePatientAdministrativeData(created.id, staleInput, secretary.id),
    ).rejects.toThrow(/changed by another user/i);

    expect(winner.version).toBe(2);
    expect((await db.select().from(patient).where(eq(patient.id, created.id)))[0]).toMatchObject({
      phone: "+212 622 222 222",
      version: 2,
    });
  });

  it("allocates unique UUIDs and patient numbers under concurrent creation", async () => {
    const created = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        createPatient(patientInput(`Parallel-${index}`), doctor.id),
      ),
    );

    expect(new Set(created.map((entry) => entry.id)).size).toBe(created.length);
    expect(new Set(created.map((entry) => entry.patientNumber)).size).toBe(created.length);
    for (const entry of created) expect(entry.patientNumber).toMatch(/^P-\d{6,}$/);
  });

  it("searches bounded pages by administrative identifiers and escapes wildcards", async () => {
    const records = await Promise.all(
      Array.from({ length: 23 }, (_, index) =>
        createPatient(
          {
            ...patientInput(`Search-${index}`),
            firstName: index === 0 ? "ÉLODIE%_Marker" : `Synthetic Search ${index}`,
            lastName: index === 1 ? "العلمي" : "Patient",
            phone: index === 2 ? "+212 (0) 655-123-456" : null,
            email: index === 3 ? "search-family@example.test" : null,
          },
          doctor.id,
        ),
      ),
    );

    expect(
      (
        await searchAdministrativePatients({
          q: records[0]!.patientNumber,
          page: 1,
          includeArchived: false,
        })
      ).items[0]?.id,
    ).toBe(records[0]!.id);
    expect(
      (await searchAdministrativePatients({ q: "élodie", page: 1, includeArchived: false })).total,
    ).toBe(1);
    expect(
      (await searchAdministrativePatients({ q: "العلمي", page: 1, includeArchived: false })).total,
    ).toBe(1);
    expect(
      (
        await searchAdministrativePatients({
          q: "+212 0 655 123 456",
          page: 1,
          includeArchived: false,
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await searchAdministrativePatients({
          q: "SEARCH-FAMILY@EXAMPLE.TEST",
          page: 1,
          includeArchived: false,
        })
      ).total,
    ).toBe(1);
    expect(
      (await searchAdministrativePatients({ q: "%_", page: 1, includeArchived: false })).total,
    ).toBe(1);

    const firstPage = await searchAdministrativePatients({
      q: "",
      page: 1,
      includeArchived: false,
    });
    const secondPage = await searchAdministrativePatients({
      q: "",
      page: 2,
      includeArchived: false,
    });
    expect(firstPage.items).toHaveLength(20);
    expect(secondPage.items).toHaveLength(3);
    expect(firstPage.pageSize).toBe(20);
  });

  it("enforces database date, uniqueness, immutability, and archive-actor constraints", async () => {
    const created = await createPatient(patientInput("Invariant"), doctor.id);

    await expect(
      db.insert(patient).values({
        firstName: "Future",
        lastName: "Synthetic",
        dateOfBirth: "2999-01-01",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(patient).values({
        patientNumber: created.patientNumber,
        firstName: "Duplicate",
        lastName: "Synthetic",
        dateOfBirth: "1990-01-01",
      }),
    ).rejects.toThrow();
    await expect(
      db.update(patient).set({ patientNumber: "P-999999" }).where(eq(patient.id, created.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(patient)
        .set({ archivedAt: new Date(), archivedBy: crypto.randomUUID() })
        .where(eq(patient.id, created.id)),
    ).rejects.toThrow();
  });

  it("returns safe failures for invalid and unknown UUIDs", async () => {
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.85");
    const invalid = await getPatient(
      request("/api/patients/not-a-uuid", { method: "GET", cookie: doctorLogin.cookie }),
      patientContext("not-a-uuid"),
    );
    const unknownId = crypto.randomUUID();
    const unknown = await getPatient(
      request(`/api/patients/${unknownId}`, { method: "GET", cookie: doctorLogin.cookie }),
      patientContext(unknownId),
    );
    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it("audits mutations using field names and versions without patient values", async () => {
    const original = patientInput("Audit-Secret-Marker");
    const created = await createPatient(original, doctor.id);
    const updated = await updatePatientAdministrativeData(
      created.id,
      {
        ...original,
        phone: "+212 644 444 444",
        address: "Changed confidential synthetic address",
        expectedVersion: created.version,
      },
      secretary.id,
    );
    const archived = await changePatientArchiveState(
      created.id,
      { action: "archive", expectedVersion: updated.version },
      doctor.id,
    );
    await changePatientArchiveState(
      created.id,
      { action: "restore", expectedVersion: archived.version },
      doctor.id,
    );

    const events = await db
      .select({ action: auditLog.action, metadata: auditLog.metadata })
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id));
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "PATIENT_CREATED",
        "PATIENT_ADMIN_UPDATED",
        "PATIENT_ARCHIVED",
        "PATIENT_RESTORED",
      ]),
    );
    expect(events.find((event) => event.action === "PATIENT_ADMIN_UPDATED")?.metadata).toEqual({
      changedFields: ["phone", "address"],
      version: 2,
    });

    const serialized = JSON.stringify(events);
    for (const forbiddenValue of [
      original.firstName,
      original.lastName,
      original.dateOfBirth,
      original.phone,
      original.email,
      original.address,
      original.emergencyContactName,
      original.emergencyContactPhone,
      "+212 644 444 444",
      "Changed confidential synthetic address",
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  });
});

function appointmentContext(appointmentId: string) {
  return { params: Promise.resolve({ id: appointmentId }) };
}

function appointmentInput(patientId: string, overrides: Record<string, unknown> = {}) {
  return {
    patientId,
    localDate: "2090-09-10",
    localStartTime: "09:00",
    durationMinutes: 30,
    administrativeReason: "Synthetic administrative visit",
    ...overrides,
  };
}

async function responseAppointmentId(response: Response): Promise<string> {
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

describe("appointment scheduling workflows", () => {
  it("allows both roles to create, list, view, and reschedule scheduled appointments", async () => {
    const patientRecord = await createPatient(patientInput("Appointment Roles"), doctor.id);
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.90");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.91");
    const doctorCreate = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: doctorLogin.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const secretaryCreate = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: secretaryLogin.cookie,
        body: appointmentInput(patientRecord.id, {
          localStartTime: "10:00",
          administrativeReason: null,
        }),
      }),
    );
    expect(doctorCreate.status).toBe(201);
    expect(secretaryCreate.status).toBe(201);
    const appointmentId = await responseAppointmentId(secretaryCreate);

    expect(
      (
        await listAppointments(
          request("/api/appointments?date=2090-09-10", {
            method: "GET",
            cookie: secretaryLogin.cookie,
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await getAppointment(
          request(`/api/appointments/${appointmentId}`, {
            method: "GET",
            cookie: secretaryLogin.cookie,
          }),
          appointmentContext(appointmentId),
        )
      ).status,
    ).toBe(200);

    const rescheduled = await rescheduleAppointmentRoute(
      request(`/api/appointments/${appointmentId}`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: {
          localDate: "2090-09-11",
          localStartTime: "11:00",
          durationMinutes: 45,
          administrativeReason: "Rescheduled synthetic visit",
          expectedVersion: 1,
        },
      }),
      appointmentContext(appointmentId),
    );
    expect(rescheduled.status).toBe(200);
    const [stored] = await db.select().from(appointment).where(eq(appointment.id, appointmentId));
    expect(stored?.version).toBe(2);
    expect(stored?.scheduledStart.toISOString()).toBe("2090-09-11T10:00:00.000Z");
  });

  it("rejects unauthenticated operations and strict-schema privilege injection", async () => {
    const patientRecord = await createPatient(patientInput("Appointment Security"), doctor.id);
    const unknownId = crypto.randomUUID();
    expect(
      (await listAppointments(request("/api/appointments?date=2090-09-10", { method: "GET" })))
        .status,
    ).toBe(401);
    expect(
      (
        await createAppointmentRoute(
          request("/api/appointments", { body: appointmentInput(patientRecord.id) }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await getAppointment(
          request(`/api/appointments/${unknownId}`, { method: "GET" }),
          appointmentContext(unknownId),
        )
      ).status,
    ).toBe(401);

    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.92");
    expect(
      (
        await createAppointmentRoute(
          request("/api/appointments", {
            cookie: doctorLogin.cookie,
            origin: "https://attacker.test",
            body: appointmentInput(patientRecord.id),
          }),
        )
      ).status,
    ).toBe(403);
    for (const injected of [
      { status: "COMPLETED" },
      { createdBy: secretary.id },
      { diagnosis: "forbidden" },
      { clinicalNotes: "forbidden" },
      { metadata: { arbitrary: true } },
    ]) {
      const response = await createAppointmentRoute(
        request("/api/appointments", {
          cookie: doctorLogin.cookie,
          body: { ...appointmentInput(patientRecord.id), ...injected },
        }),
      );
      expect(response.status).toBe(400);
    }
  });

  it("enforces the doctor/secretary transition policy and terminal states", async () => {
    const patientRecord = await createPatient(patientInput("Appointment Lifecycle"), doctor.id);
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.93");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.94");
    const createdResponse = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: secretaryLogin.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const appointmentId = await responseAppointmentId(createdResponse);

    const arrived = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { targetStatus: "ARRIVED", expectedVersion: 1 },
      }),
      appointmentContext(appointmentId),
    );
    expect(arrived.status).toBe(200);
    const secretaryStart = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { targetStatus: "IN_CONSULTATION", expectedVersion: 2 },
      }),
      appointmentContext(appointmentId),
    );
    expect(secretaryStart.status).toBe(403);
    const started = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { targetStatus: "IN_CONSULTATION", expectedVersion: 2 },
      }),
      appointmentContext(appointmentId),
    );
    expect(started.status).toBe(200);
    const secretaryComplete = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: secretaryLogin.cookie,
        body: { targetStatus: "COMPLETED", expectedVersion: 3 },
      }),
      appointmentContext(appointmentId),
    );
    expect(secretaryComplete.status).toBe(403);
    const completed = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { targetStatus: "COMPLETED", expectedVersion: 3 },
      }),
      appointmentContext(appointmentId),
    );
    expect(completed.status).toBe(200);
    const reopen = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: doctorLogin.cookie,
        body: { targetStatus: "SCHEDULED", expectedVersion: 4 },
      }),
      appointmentContext(appointmentId),
    );
    expect(reopen.status).toBe(409);
  });

  it("returns overlap warnings, permits explicit confirmation, and uses half-open intervals", async () => {
    const patientRecord = await createPatient(patientInput("Overlap"), doctor.id);
    const login = await signIn(secretary.email, secretaryPassword, "192.0.2.95");
    expect(
      (
        await createAppointmentRoute(
          request("/api/appointments", {
            cookie: login.cookie,
            body: appointmentInput(patientRecord.id),
          }),
        )
      ).status,
    ).toBe(201);
    const boundary = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, { localStartTime: "09:30" }),
      }),
    );
    expect(boundary.status).toBe(201);

    const overlap = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, { localStartTime: "09:15" }),
      }),
    );
    expect(overlap.status).toBe(409);
    expect(await overlap.json()).toEqual(
      expect.objectContaining({ code: "APPOINTMENT_OVERLAP", conflictCount: 2 }),
    );
    const confirmed = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, {
          localStartTime: "09:15",
          allowOverlap: true,
        }),
      }),
    );
    expect(confirmed.status).toBe(201);

    const containedWarning = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, {
          localStartTime: "09:20",
          durationMinutes: 5,
        }),
      }),
    );
    expect(containedWarning.status).toBe(409);
  });

  it("excludes cancelled appointments from overlap warnings", async () => {
    const patientRecord = await createPatient(patientInput("Cancelled Overlap"), doctor.id);
    const login = await signIn(secretary.email, secretaryPassword, "192.0.2.96");
    const created = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const id = await responseAppointmentId(created);
    expect(
      (
        await transitionAppointmentRoute(
          request(`/api/appointments/${id}/transition`, {
            method: "PATCH",
            cookie: login.cookie,
            body: { targetStatus: "CANCELLED", expectedVersion: 1 },
          }),
          appointmentContext(id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await createAppointmentRoute(
          request("/api/appointments", {
            cookie: login.cookie,
            body: appointmentInput(patientRecord.id, { localStartTime: "09:15" }),
          }),
        )
      ).status,
    ).toBe(201);
  });

  it("recalculates overlaps when rescheduling and after explicit confirmation", async () => {
    const patientRecord = await createPatient(patientInput("Reschedule Overlap"), doctor.id);
    const login = await signIn(secretary.email, secretaryPassword, "192.0.2.102");
    await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const second = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, { localStartTime: "10:00" }),
      }),
    );
    const secondId = await responseAppointmentId(second);
    const reschedule = {
      localDate: "2090-09-10",
      localStartTime: "09:15",
      durationMinutes: 30,
      administrativeReason: null,
      expectedVersion: 1,
    };
    expect(
      (
        await rescheduleAppointmentRoute(
          request(`/api/appointments/${secondId}`, {
            method: "PATCH",
            cookie: login.cookie,
            body: reschedule,
          }),
          appointmentContext(secondId),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await rescheduleAppointmentRoute(
          request(`/api/appointments/${secondId}`, {
            method: "PATCH",
            cookie: login.cookie,
            body: { ...reschedule, allowOverlap: true },
          }),
          appointmentContext(secondId),
        )
      ).status,
    ).toBe(200);
  });

  it("prevents stale transitions from overwriting the latest state", async () => {
    const patientRecord = await createPatient(patientInput("Stale Appointment"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.97");
    const created = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const id = await responseAppointmentId(created);
    const arrived = await transitionAppointmentRoute(
      request(`/api/appointments/${id}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "ARRIVED", expectedVersion: 1 },
      }),
      appointmentContext(id),
    );
    const staleCancel = await transitionAppointmentRoute(
      request(`/api/appointments/${id}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "CANCELLED", expectedVersion: 1 },
      }),
      appointmentContext(id),
    );
    expect(arrived.status).toBe(200);
    expect(staleCancel.status).toBe(409);
    const [stored] = await db.select().from(appointment).where(eq(appointment.id, id));
    expect(stored).toMatchObject({ status: "ARRIVED", version: 2 });
  });

  it("coordinates archived patients with active and historical appointments", async () => {
    const patientRecord = await createPatient(patientInput("Archive Appointment"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.98");
    const created = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const id = await responseAppointmentId(created);
    await expect(
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ).rejects.toThrow(/non-terminal appointments/);
    await transitionAppointmentRoute(
      request(`/api/appointments/${id}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "CANCELLED", expectedVersion: 1 },
      }),
      appointmentContext(id),
    );
    const archived = await changePatientArchiveState(
      patientRecord.id,
      { action: "archive", expectedVersion: 1 },
      doctor.id,
    );
    expect((await listPatientAppointments(patientRecord.id)).items).toHaveLength(1);
    const blocked = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, { localStartTime: "12:00" }),
      }),
    );
    expect(blocked.status).toBe(409);
    expect(archived.archivedAt).not.toBeNull();
  });

  it.each(["SCHEDULED", "ARRIVED", "IN_CONSULTATION"] as const)(
    "blocks archival for a past %s appointment",
    async (status) => {
      const patientRecord = await createPatient(patientInput(`Past ${status}`), doctor.id);
      await db.insert(appointment).values({
        patientId: patientRecord.id,
        createdBy: doctor.id,
        scheduledStart: new Date("2020-01-10T09:00:00Z"),
        scheduledEnd: new Date("2020-01-10T09:30:00Z"),
        status,
      });

      await expect(
        changePatientArchiveState(
          patientRecord.id,
          { action: "archive", expectedVersion: 1 },
          doctor.id,
        ),
      ).rejects.toThrow(/non-terminal appointments/);
    },
  );

  it.each(["COMPLETED", "CANCELLED", "NO_SHOW"] as const)(
    "allows archival with a %s appointment",
    async (status) => {
      const patientRecord = await createPatient(patientInput(`Terminal ${status}`), doctor.id);
      await db.insert(appointment).values({
        patientId: patientRecord.id,
        createdBy: doctor.id,
        scheduledStart: new Date("2020-01-10T09:00:00Z"),
        scheduledEnd: new Date("2020-01-10T09:30:00Z"),
        status,
        ...(status === "CANCELLED"
          ? { cancelledAt: new Date("2020-01-09T12:00:00Z"), cancelledBy: doctor.id }
          : {}),
      });

      const archived = await changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      );
      expect(archived.archivedAt).not.toBeNull();
    },
  );

  it("uses clinic-local agenda boundaries for a 00:30 appointment", async () => {
    const patientRecord = await createPatient(patientInput("Timezone Appointment"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.99");
    await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, {
          localDate: "2026-09-10",
          localStartTime: "00:30",
        }),
      }),
    );
    const correctDay = await listAppointments(
      request("/api/appointments?date=2026-09-10", { method: "GET", cookie: login.cookie }),
    );
    const previousDay = await listAppointments(
      request("/api/appointments?date=2026-09-09", { method: "GET", cookie: login.cookie }),
    );
    const correctBody: unknown = await correctDay.json();
    const previousBody: unknown = await previousDay.json();
    expect(JSON.stringify(correctBody)).toContain(patientRecord.patientNumber);
    expect(JSON.stringify(previousBody)).not.toContain(patientRecord.patientNumber);
  });

  it("keeps concurrent confirmed double-bookings transactionally valid", async () => {
    const patientRecord = await createPatient(patientInput("Concurrent Appointments"), doctor.id);
    const login = await signIn(secretary.email, secretaryPassword, "192.0.2.100");
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        createAppointmentRoute(
          request("/api/appointments", {
            cookie: login.cookie,
            body: appointmentInput(patientRecord.id, { allowOverlap: true }),
          }),
        ),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const rows = await db.select().from(appointment);
    expect(new Set(rows.map((row) => row.id)).size).toBe(8);
    expect(rows.every((row) => row.scheduledEnd > row.scheduledStart)).toBe(true);
  });

  it("enforces PostgreSQL appointment constraints and writes value-free audit metadata", async () => {
    const reasonMarker = "Synthetic confidential scheduling marker";
    const patientRecord = await createPatient(patientInput("Appointment Audit Marker"), doctor.id);
    await expect(
      db.insert(appointment).values({
        patientId: patientRecord.id,
        createdBy: doctor.id,
        scheduledStart: new Date("2090-09-10T10:00:00Z"),
        scheduledEnd: new Date("2090-09-10T09:00:00Z"),
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(appointment).values({
        patientId: crypto.randomUUID(),
        createdBy: doctor.id,
        scheduledStart: new Date("2090-09-10T09:00:00Z"),
        scheduledEnd: new Date("2090-09-10T09:30:00Z"),
      }),
    ).rejects.toThrow();

    const login = await signIn(doctor.email, doctorPassword, "192.0.2.101");
    const created = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id, { administrativeReason: reasonMarker }),
      }),
    );
    const id = await responseAppointmentId(created);
    await transitionAppointmentRoute(
      request(`/api/appointments/${id}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "CANCELLED", expectedVersion: 1 },
      }),
      appointmentContext(id),
    );
    const events = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(events.map((event) => event.action)).toEqual([
      "APPOINTMENT_CREATED",
      "APPOINTMENT_STATUS_CHANGED",
    ]);
    const serialized = JSON.stringify(events.map((event) => event.metadata));
    expect(serialized).not.toContain(reasonMarker);
    expect(serialized).not.toContain(patientRecord.firstName);
    expect(serialized).not.toContain(patientRecord.patientNumber);
  });
});

function consultationContext(consultationId: string) {
  return { params: Promise.resolve({ id: consultationId }) };
}

function doctorActor() {
  return {
    id: doctor.id,
    name: "Synthetic Doctor",
    email: doctor.email,
    role: "DOCTOR" as const,
  };
}

async function responseConsultationId(response: Response): Promise<string> {
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

const privateClinicalFields = {
  reasonForVisit: "TEST_REASON_PRIVATE_11223",
  observations: "TEST_OBSERVATION_PRIVATE_33445",
  diagnosis: "TEST_DIAGNOSIS_PRIVATE_94821",
  notes: 'TEST_NOTE_PRIVATE_58392 <script>alert("clinical")</script>',
};

describe("doctor-only consultation workflows", () => {
  it("denies every clinical operation to secretaries and unauthenticated callers", async () => {
    const patientRecord = await createPatient(patientInput("Clinical Authorization"), doctor.id);
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.110");
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.111");
    const created = await startDirectRoute(
      request("/api/consultations", {
        cookie: doctorLogin.cookie,
        body: { patientId: patientRecord.id },
      }),
    );
    const id = await responseConsultationId(created);

    expect(
      (await listConsultationsRoute(request("/api/consultations", { method: "GET" }))).status,
    ).toBe(401);
    expect(
      (
        await listConsultationsRoute(
          request("/api/consultations", { method: "GET", cookie: secretaryLogin.cookie }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getConsultation(
          request(`/api/consultations/${id}`, { method: "GET", cookie: secretaryLogin.cookie }),
          consultationContext(id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await startDirectRoute(
          request("/api/consultations", {
            cookie: secretaryLogin.cookie,
            body: { patientId: patientRecord.id },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await startFromAppointmentRoute(
          request("/api/consultations/from-appointment", {
            cookie: secretaryLogin.cookie,
            body: { appointmentId: crypto.randomUUID(), expectedAppointmentVersion: 1 },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await saveRevisionRoute(
          request(`/api/consultations/${id}/revisions`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1, ...privateClinicalFields },
          }),
          consultationContext(id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await finalizeConsultationRoute(
          request(`/api/consultations/${id}/finalize`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1 },
          }),
          consultationContext(id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await addendumRoute(
          request(`/api/consultations/${id}/addenda`, {
            cookie: secretaryLogin.cookie,
            body: { content: "private" },
          }),
          consultationContext(id),
        )
      ).status,
    ).toBe(403);
  });

  it("starts a direct consultation only for an active patient and blocks archival", async () => {
    const patientRecord = await createPatient(patientInput("Direct Clinical"), doctor.id);
    const direct = await startDirectConsultation({ patientId: patientRecord.id }, doctorActor());
    expect(direct).toMatchObject({ status: "IN_PROGRESS", version: 1, revisionNumber: 0 });
    await expect(
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ).rejects.toThrow(/in-progress consultations/);

    await saveClinicalNoteRevision(
      direct.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    await finalizeConsultation(direct.id, { expectedVersion: 2 }, doctorActor());
    const archived = await changePatientArchiveState(
      patientRecord.id,
      { action: "archive", expectedVersion: 1 },
      doctor.id,
    );
    expect(archived.archivedAt).not.toBeNull();
    await expect(
      startDirectConsultation({ patientId: patientRecord.id }, doctorActor()),
    ).rejects.toThrow(/Archived patients/);
  });

  it("atomically starts a consultation from an arrived appointment and rejects duplicate starts", async () => {
    const patientRecord = await createPatient(patientInput("Linked Clinical"), doctor.id);
    const otherPatient = await createPatient(patientInput("Linked Mismatch"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.112");
    const createdAppointment = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const appointmentId = await responseAppointmentId(createdAppointment);
    await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "ARRIVED", expectedVersion: 1 },
      }),
      appointmentContext(appointmentId),
    );

    await expect(
      db.insert(consultation).values({
        patientId: otherPatient.id,
        appointmentId,
        doctorId: doctor.id,
      }),
    ).rejects.toThrow();

    const started = await startFromAppointmentRoute(
      request("/api/consultations/from-appointment", {
        cookie: login.cookie,
        body: { appointmentId, expectedAppointmentVersion: 2 },
      }),
    );
    expect(started.status).toBe(201);
    const consultationId = await responseConsultationId(started);
    const [appointmentRecord] = await db
      .select()
      .from(appointment)
      .where(eq(appointment.id, appointmentId));
    const [consultationRecord] = await db
      .select()
      .from(consultation)
      .where(eq(consultation.id, consultationId));
    expect(appointmentRecord).toMatchObject({ status: "IN_CONSULTATION", version: 3 });
    expect(consultationRecord).toMatchObject({
      status: "IN_PROGRESS",
      appointmentId,
      patientId: patientRecord.id,
    });

    const duplicate = await startFromAppointmentRoute(
      request("/api/consultations/from-appointment", {
        cookie: login.cookie,
        body: { appointmentId, expectedAppointmentVersion: 3 },
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await db.select().from(consultation)).toHaveLength(1);
  });

  it("makes consultation finalization the only linked appointment completion path", async () => {
    const patientRecord = await createPatient(patientInput("Finalize Linked"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.113");
    const createdAppointment = await createAppointmentRoute(
      request("/api/appointments", {
        cookie: login.cookie,
        body: appointmentInput(patientRecord.id),
      }),
    );
    const appointmentId = await responseAppointmentId(createdAppointment);
    await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "ARRIVED", expectedVersion: 1 },
      }),
      appointmentContext(appointmentId),
    );
    const started = await startConsultationFromAppointment(
      { appointmentId, expectedAppointmentVersion: 2 },
      doctorActor(),
    );
    const saved = await saveClinicalNoteRevision(
      started.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );

    const bypass = await transitionAppointmentRoute(
      request(`/api/appointments/${appointmentId}/transition`, {
        method: "PATCH",
        cookie: login.cookie,
        body: { targetStatus: "COMPLETED", expectedVersion: 3 },
      }),
      appointmentContext(appointmentId),
    );
    expect(bypass.status).toBe(409);
    const finalized = await finalizeConsultation(
      started.id,
      { expectedVersion: saved.version },
      doctorActor(),
    );
    expect(finalized.status).toBe("FINALIZED");
    const [linkedAppointment] = await db
      .select()
      .from(appointment)
      .where(eq(appointment.id, appointmentId));
    expect(linkedAppointment).toMatchObject({ status: "COMPLETED", version: 4 });
  });

  it("creates complete immutable revisions and rejects stale concurrent saves", async () => {
    const patientRecord = await createPatient(patientInput("Revision History"), doctor.id);
    const started = await startDirectConsultation({ patientId: patientRecord.id }, doctorActor());
    const first = await saveClinicalNoteRevision(
      started.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    const firstBefore = (
      await db
        .select()
        .from(clinicalNoteRevision)
        .where(eq(clinicalNoteRevision.consultationId, started.id))
    )[0];
    if (!firstBefore) throw new Error("Expected the first clinical revision.");
    const second = await saveClinicalNoteRevision(
      started.id,
      {
        expectedVersion: first.version,
        ...privateClinicalFields,
        notes: "SECOND_PRIVATE_NOTE_22002",
      },
      doctorActor(),
    );
    expect(second).toMatchObject({ revisionNumber: 2, version: 3 });
    const revisions = await db
      .select()
      .from(clinicalNoteRevision)
      .where(eq(clinicalNoteRevision.consultationId, started.id));
    expect(revisions).toHaveLength(2);
    expect(revisions.find((revision) => revision.revisionNumber === 1)).toEqual(firstBefore);

    const attempts = await Promise.allSettled([
      saveClinicalNoteRevision(
        started.id,
        { expectedVersion: 3, ...privateClinicalFields, notes: "CONCURRENT_WIN_A" },
        doctorActor(),
      ),
      saveClinicalNoteRevision(
        started.id,
        { expectedVersion: 3, ...privateClinicalFields, notes: "CONCURRENT_WIN_B" },
        doctorActor(),
      ),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await db
        .select()
        .from(clinicalNoteRevision)
        .where(eq(clinicalNoteRevision.consultationId, started.id)),
    ).toHaveLength(3);

    await expect(
      db
        .update(clinicalNoteRevision)
        .set({ notes: "MUTATED" })
        .where(eq(clinicalNoteRevision.id, firstBefore.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(clinicalNoteRevision).where(eq(clinicalNoteRevision.id, firstBefore.id)),
    ).rejects.toThrow();
  });

  it("requires a revision, freezes its ownership, and protects finalized consultation identity", async () => {
    const patientA = await createPatient(patientInput("Final A"), doctor.id);
    const patientB = await createPatient(patientInput("Final B"), doctor.id);
    const consultationA = await startDirectConsultation({ patientId: patientA.id }, doctorActor());
    const consultationB = await startDirectConsultation({ patientId: patientB.id }, doctorActor());
    await expect(
      finalizeConsultation(consultationA.id, { expectedVersion: 1 }, doctorActor()),
    ).rejects.toThrow(/at least one/);
    const savedA = await saveClinicalNoteRevision(
      consultationA.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    const latestA = await saveClinicalNoteRevision(
      consultationA.id,
      { expectedVersion: savedA.version, ...privateClinicalFields, notes: "LATEST_A_PRIVATE" },
      doctorActor(),
    );
    await saveClinicalNoteRevision(
      consultationB.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    const [revisionB] = await db
      .select()
      .from(clinicalNoteRevision)
      .where(eq(clinicalNoteRevision.consultationId, consultationB.id));
    if (!revisionB) throw new Error("Expected the second consultation revision.");
    const [firstRevisionA] = await db
      .select()
      .from(clinicalNoteRevision)
      .where(
        and(
          eq(clinicalNoteRevision.consultationId, consultationA.id),
          eq(clinicalNoteRevision.revisionNumber, 1),
        ),
      );
    if (!firstRevisionA) throw new Error("Expected the first consultation revision.");

    await expect(
      db
        .update(consultation)
        .set({ status: "FINALIZED", finalizedAt: new Date(), finalRevisionId: firstRevisionA.id })
        .where(eq(consultation.id, consultationA.id)),
    ).rejects.toThrow();

    await expect(
      db
        .update(consultation)
        .set({ status: "FINALIZED", finalizedAt: new Date(), finalRevisionId: revisionB.id })
        .where(eq(consultation.id, consultationA.id)),
    ).rejects.toThrow();
    await finalizeConsultation(
      consultationA.id,
      { expectedVersion: latestA.version },
      doctorActor(),
    );
    await expect(
      db
        .update(consultation)
        .set({ finalRevisionId: revisionB.id })
        .where(eq(consultation.id, consultationA.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(consultation)
        .set({ status: "IN_PROGRESS", finalizedAt: null, finalRevisionId: null })
        .where(eq(consultation.id, consultationA.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(consultation).where(eq(consultation.id, consultationA.id)),
    ).rejects.toThrow();
    await expect(
      db.insert(clinicalNoteRevision).values({
        consultationId: consultationA.id,
        revisionNumber: 3,
        notes: "LATE_REVISION_PRIVATE",
        createdBy: doctor.id,
      }),
    ).rejects.toThrow();
  });

  it("allows append-only addenda only after finalization", async () => {
    const patientRecord = await createPatient(patientInput("Clinical Addenda"), doctor.id);
    const started = await startDirectConsultation({ patientId: patientRecord.id }, doctorActor());
    await expect(
      addClinicalAddendum(started.id, { content: "TOO_EARLY_PRIVATE" }, doctorActor()),
    ).rejects.toThrow(/only after/);
    const saved = await saveClinicalNoteRevision(
      started.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    await finalizeConsultation(started.id, { expectedVersion: saved.version }, doctorActor());
    const first = await addClinicalAddendum(
      started.id,
      { content: "ADDENDUM_PRIVATE_ONE" },
      doctorActor(),
    );
    await addClinicalAddendum(started.id, { content: "ADDENDUM_PRIVATE_TWO" }, doctorActor());
    expect(
      await db
        .select()
        .from(clinicalNoteAddendum)
        .where(eq(clinicalNoteAddendum.consultationId, started.id)),
    ).toHaveLength(2);
    await expect(
      db
        .update(clinicalNoteAddendum)
        .set({ content: "MUTATED" })
        .where(eq(clinicalNoteAddendum.id, first.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(clinicalNoteAddendum).where(eq(clinicalNoteAddendum.id, first.id)),
    ).rejects.toThrow();
  });

  it("cannot race direct consultation creation into an archived patient", async () => {
    const patientRecord = await createPatient(patientInput("Archive Race"), doctor.id);
    const outcomes = await Promise.allSettled([
      startDirectConsultation({ patientId: patientRecord.id }, doctorActor()),
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ]);
    const [storedPatient] = await db.select().from(patient).where(eq(patient.id, patientRecord.id));
    const openConsultations = await db
      .select()
      .from(consultation)
      .where(
        and(eq(consultation.patientId, patientRecord.id), eq(consultation.status, "IN_PROGRESS")),
      );
    expect(storedPatient?.archivedAt !== null && openConsultations.length > 0).toBe(false);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("keeps clinical values out of audit, administrative DTOs, errors, and safe logs", async () => {
    const logSpies = [
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      const patientRecord = await createPatient(patientInput("Clinical Privacy"), doctor.id);
      const started = await startDirectConsultation({ patientId: patientRecord.id }, doctorActor());
      const saved = await saveClinicalNoteRevision(
        started.id,
        { expectedVersion: 1, ...privateClinicalFields },
        doctorActor(),
      );
      await finalizeConsultation(started.id, { expectedVersion: saved.version }, doctorActor());
      await addClinicalAddendum(
        started.id,
        { content: "TEST_ADDENDUM_PRIVATE_77551" },
        doctorActor(),
      );

      const audit = JSON.stringify(
        (await db.select().from(auditLog)).map((entry) => entry.metadata),
      );
      const administrativePatient = JSON.stringify(
        await searchAdministrativePatients({
          q: patientRecord.patientNumber,
          page: 1,
          includeArchived: false,
        }),
      );
      const appointmentDtos = JSON.stringify(await listPatientAppointments(patientRecord.id));
      const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.115");
      const secretaryResponse = JSON.stringify(
        await (
          await getConsultation(
            request(`/api/consultations/${started.id}`, {
              method: "GET",
              cookie: secretaryLogin.cookie,
            }),
            consultationContext(started.id),
          )
        ).json(),
      );
      let staleError = "";
      try {
        await saveClinicalNoteRevision(
          started.id,
          { expectedVersion: 1, ...privateClinicalFields },
          doctorActor(),
        );
      } catch (error) {
        staleError = error instanceof Error ? error.message : String(error);
      }
      const logs = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      for (const marker of [
        ...Object.values(privateClinicalFields),
        "TEST_ADDENDUM_PRIVATE_77551",
      ]) {
        expect(audit).not.toContain(marker);
        expect(administrativePatient).not.toContain(marker);
        expect(appointmentDtos).not.toContain(marker);
        expect(secretaryResponse).not.toContain(marker);
        expect(staleError).not.toContain(marker);
        expect(logs).not.toContain(marker);
      }
    } finally {
      for (const spy of logSpies) spy.mockRestore();
    }
  });

  it("returns private no-store clinical responses", async () => {
    const patientRecord = await createPatient(patientInput("Clinical Cache"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.114");
    const started = await startDirectRoute(
      request("/api/consultations", {
        cookie: login.cookie,
        body: { patientId: patientRecord.id },
      }),
    );
    const id = await responseConsultationId(started);
    const detail = await getConsultation(
      request(`/api/consultations/${id}`, { method: "GET", cookie: login.cookie }),
      consultationContext(id),
    );
    expect(detail.headers.get("cache-control")).toBe("private, no-store");
    expect(detail.headers.get("pragma")).toBe("no-cache");
  });
});

function followUpContext(followUpId: string) {
  return { params: Promise.resolve({ id: followUpId }) };
}

async function responseFollowUpId(response: Response): Promise<string> {
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

async function responsePdfText(response: Response): Promise<string> {
  const bytes = Buffer.from(await response.arrayBuffer());
  return [...bytes.toString("latin1").matchAll(/<([0-9a-f]+)>/g)]
    .map((match) => (match[1] ? Buffer.from(match[1], "hex").toString("latin1") : ""))
    .join("");
}

function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const privateFollowUpReason = 'TEST_FOLLOWUP_PRIVATE_72194 <script>alert("follow-up")</script>';

function prescriptionContext(prescriptionId: string) {
  return { params: Promise.resolve({ id: prescriptionId }) };
}

async function configurePracticeProfile(name = "Synthetic Clinic A", doctorName = "Dr. Synthetic") {
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

const privatePrescriptionItems = [
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

describe("doctor-only prescription workflows", () => {
  it("denies secretary and unauthenticated prescription access before lookup", async () => {
    const patientRecord = await createPatient(
      patientInput("Prescription Authorization"),
      doctor.id,
    );
    const created = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.131");
    expect(
      (await listPrescriptionsRoute(request("/api/prescriptions", { method: "GET" }))).status,
    ).toBe(401);
    expect(
      (
        await listPrescriptionsRoute(
          request("/api/prescriptions", { method: "GET", cookie: secretaryLogin.cookie }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getPrescriptionRoute(
          request(`/api/prescriptions/${created.id}`, {
            method: "GET",
            cookie: secretaryLogin.cookie,
          }),
          prescriptionContext(created.id),
        )
      ).status,
    ).toBe(403);
    for (const operation of [
      () =>
        createPrescriptionRoute(
          request("/api/prescriptions", {
            cookie: secretaryLogin.cookie,
            body: { patientId: patientRecord.id },
          }),
        ),
      () =>
        savePrescriptionRoute(
          request(`/api/prescriptions/${created.id}/save`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1, consultationId: null, items: [] },
          }),
          prescriptionContext(created.id),
        ),
      () =>
        finalizePrescriptionRoute(
          request(`/api/prescriptions/${created.id}/finalize`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1 },
          }),
          prescriptionContext(created.id),
        ),
      () =>
        duplicatePrescriptionRoute(
          request(`/api/prescriptions/${created.id}/duplicate`, { cookie: secretaryLogin.cookie }),
          prescriptionContext(created.id),
        ),
      () =>
        replacePrescriptionRoute(
          request(`/api/prescriptions/${created.id}/replace`, { cookie: secretaryLogin.cookie }),
          prescriptionContext(created.id),
        ),
      () =>
        voidPrescriptionRoute(
          request(`/api/prescriptions/${created.id}/void`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1 },
          }),
          prescriptionContext(created.id),
        ),
      () =>
        savePracticeProfileRoute(
          request("/api/settings/practice", {
            method: "PATCH",
            cookie: secretaryLogin.cookie,
            body: {},
          }),
        ),
    ])
      expect((await operation()).status).toBe(403);
    expect(
      (await listPrescriptionsRoute(request("/api/prescriptions", { method: "GET" }))).status,
    ).toBe(401);
  });

  it("creates, saves, finalizes, snapshots, voids, duplicates, and preserves history", async () => {
    await configurePracticeProfile();
    const patientRecord = await createPatient(patientInput("Prescription History"), doctor.id);
    const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    const saved = await savePrescriptionDraft(
      draft.id,
      { expectedVersion: 1, consultationId: null, items: privatePrescriptionItems },
      doctorActor(),
    );
    const issued = await finalizePrescription(
      draft.id,
      { expectedVersion: saved.version },
      doctorActor(),
    );
    expect(issued).toMatchObject({
      status: "FINALIZED",
      version: 3,
      prescriptionNumber: "RX-000001",
    });
    const detail = await findPrescriptionDetail(draft.id);
    expect(detail?.snapshot).toMatchObject({
      patientName: "Synthetic Prescription History Patient",
      clinicName: "Synthetic Clinic A",
      doctorName: "Dr. Synthetic",
    });
    expect(detail?.items[0]?.medicationName).toContain("TEST_MEDICATION_PRIVATE_78123");
    await expect(
      db
        .update(prescription)
        .set({ prescriptionNumber: "RX-999999" })
        .where(eq(prescription.id, draft.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(prescriptionItem)
        .set({ medicationName: "Tampered" })
        .where(eq(prescriptionItem.prescriptionId, draft.id)),
    ).rejects.toThrow();
    await expect(
      db
        .insert(prescriptionItem)
        .values({ prescriptionId: draft.id, position: 99, medicationName: "Injected" }),
    ).rejects.toThrow();
    await expect(
      db.delete(prescriptionItem).where(eq(prescriptionItem.prescriptionId, draft.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(prescriptionIssueSnapshot)
        .set({ clinicName: "Tampered" })
        .where(eq(prescriptionIssueSnapshot.prescriptionId, draft.id)),
    ).rejects.toThrow();
    await expect(
      db
        .delete(prescriptionIssueSnapshot)
        .where(eq(prescriptionIssueSnapshot.prescriptionId, draft.id)),
    ).rejects.toThrow();
    await expect(db.delete(prescription).where(eq(prescription.id, draft.id))).rejects.toThrow();
    const [currentPatient] = await db
      .select({ version: patient.version })
      .from(patient)
      .where(eq(patient.id, patientRecord.id));
    const updatedPatient = await updatePatientAdministrativeData(
      patientRecord.id,
      {
        ...patientInput("Prescription History Updated"),
        expectedVersion: currentPatient?.version ?? patientRecord.version,
      },
      doctor.id,
    );
    expect(updatedPatient.firstName).toContain("Updated");
    await savePracticeProfile(
      {
        clinic: { name: "Synthetic Clinic B", address: "Changed", phone: null, expectedVersion: 1 },
        doctor: {
          displayName: "Dr. Changed",
          specialty: "Changed",
          professionalIdentifier: "SYN-002",
          expectedVersion: 1,
        },
      },
      doctorActor(),
    );
    const historical = await findPrescriptionDetail(draft.id);
    expect(historical?.snapshot).toMatchObject({
      patientName: "Synthetic Prescription History Patient",
      clinicName: "Synthetic Clinic A",
      doctorName: "Dr. Synthetic",
    });
    await expect(duplicatePrescription(draft.id, doctorActor())).resolves.toMatchObject({
      status: "DRAFT",
      prescriptionNumber: null,
    });
    const voided = await voidPrescription(
      draft.id,
      { expectedVersion: issued.version },
      doctorActor(),
    );
    expect(voided).toMatchObject({ status: "VOID", version: 4 });
    await expect(voidPrescription(draft.id, { expectedVersion: 4 }, doctorActor())).rejects.toThrow(
      /finalized/,
    );
  });

  it("rolls back finalization prerequisites without a number or snapshot", async () => {
    const patientRecord = await createPatient(
      patientInput("Prescription Prerequisites"),
      doctor.id,
    );
    const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    await savePrescriptionDraft(
      draft.id,
      {
        expectedVersion: 1,
        consultationId: null,
        items: [{ medicationName: "Profile prerequisite item" }],
      },
      doctorActor(),
    );
    await expect(
      finalizePrescription(draft.id, { expectedVersion: 2 }, doctorActor()),
    ).rejects.toThrow(/profile/);
    const [afterProfileFailure] = await db
      .select()
      .from(prescription)
      .where(eq(prescription.id, draft.id));
    expect(afterProfileFailure).toMatchObject({
      status: "DRAFT",
      prescriptionNumber: null,
      version: 2,
    });
    await configurePracticeProfile();
    const emptyDraft = await createPrescriptionDraft(
      { patientId: patientRecord.id },
      doctorActor(),
    );
    await expect(
      finalizePrescription(emptyDraft.id, { expectedVersion: 1 }, doctorActor()),
    ).rejects.toThrow(/item/);
    const [afterItemFailure] = await db
      .select()
      .from(prescription)
      .where(eq(prescription.id, emptyDraft.id));
    expect(afterItemFailure).toMatchObject({
      status: "DRAFT",
      prescriptionNumber: null,
      version: 1,
    });
    expect(
      await db
        .select()
        .from(prescriptionIssueSnapshot)
        .where(eq(prescriptionIssueSnapshot.prescriptionId, emptyDraft.id)),
    ).toHaveLength(0);
  });

  it("protects draft concurrency and allocates distinct numbers for concurrent finalization", async () => {
    await configurePracticeProfile();
    const patientRecord = await createPatient(patientInput("Prescription Concurrency"), doctor.id);
    const drafts = await Promise.all([
      createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor()),
      createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor()),
    ]);
    await Promise.all(
      drafts.map((draft) =>
        savePrescriptionDraft(
          draft.id,
          {
            expectedVersion: 1,
            consultationId: null,
            items: [{ medicationName: `Synthetic medication ${draft.id}` }],
          },
          doctorActor(),
        ),
      ),
    );
    const first = drafts[0];
    if (!first) throw new Error("Missing draft fixture.");
    const stale = await Promise.allSettled([
      savePrescriptionDraft(
        first.id,
        { expectedVersion: 2, consultationId: null, items: [{ medicationName: "First edit" }] },
        doctorActor(),
      ),
      savePrescriptionDraft(
        first.id,
        { expectedVersion: 2, consultationId: null, items: [{ medicationName: "Stale edit" }] },
        doctorActor(),
      ),
    ]);
    expect(stale.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const finalized = await Promise.all(
      drafts.map((draft) =>
        finalizePrescription(
          draft.id,
          { expectedVersion: draft.id === first.id ? 3 : 2 },
          doctorActor(),
        ),
      ),
    );
    expect(new Set(finalized.map((item) => item.prescriptionNumber)).size).toBe(2);
  });

  it("supports consultation ownership, duplication, replacement, and one issued replacement", async () => {
    await configurePracticeProfile();
    const patientA = await createPatient(patientInput("Prescription Replacement A"), doctor.id);
    const patientB = await createPatient(patientInput("Prescription Replacement B"), doctor.id);
    const consultationA = await startDirectConsultation({ patientId: patientA.id }, doctorActor());
    const original = await createPrescriptionDraft(
      { consultationId: consultationA.id },
      doctorActor(),
    );
    await savePrescriptionDraft(
      original.id,
      {
        expectedVersion: 1,
        consultationId: consultationA.id,
        items: [{ medicationName: "Original item" }],
      },
      doctorActor(),
    );
    await finalizePrescription(original.id, { expectedVersion: 2 }, doctorActor());
    await expect(
      createPrescriptionDraft(
        { patientId: patientB.id, consultationId: consultationA.id },
        doctorActor(),
      ),
    ).rejects.toThrow();
    const replacement = await createReplacementPrescription(original.id, doctorActor());
    expect(replacement).toMatchObject({ status: "DRAFT" });
    const duplicate = await duplicatePrescription(original.id, doctorActor());
    expect(duplicate).toMatchObject({ status: "DRAFT", prescriptionNumber: null });
    await savePrescriptionDraft(
      replacement.id,
      {
        expectedVersion: 1,
        consultationId: consultationA.id,
        items: [{ medicationName: "Corrected item" }],
      },
      doctorActor(),
    );
    const replacementIssued = await finalizePrescription(
      replacement.id,
      { expectedVersion: 2 },
      doctorActor(),
    );
    expect(replacementIssued.prescriptionNumber).not.toBe("RX-000001");
    await expect(createReplacementPrescription(original.id, doctorActor())).rejects.toThrow(
      /issued replacement/,
    );
    await expect(
      db
        .update(prescription)
        .set({ replacesPrescriptionId: original.id })
        .where(eq(prescription.id, original.id)),
    ).rejects.toThrow();
  });

  it("blocks drafts and races from archiving, while issued history does not block archive", async () => {
    await configurePracticeProfile();
    const patientRecord = await createPatient(patientInput("Prescription Archive"), doctor.id);
    const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    await expect(
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ).rejects.toThrow(/draft prescriptions/);
    await discardPrescriptionRoute(
      request(`/api/prescriptions/${draft.id}/discard`, {
        cookie: (await signIn(doctor.email, doctorPassword, "192.0.2.132")).cookie,
        body: { expectedVersion: 1 },
      }),
      prescriptionContext(draft.id),
    );
    await expect(
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
    const second = await createPatient(patientInput("Prescription Archive Race"), doctor.id);
    const outcomes = await Promise.allSettled([
      createPrescriptionDraft({ patientId: second.id }, doctorActor()),
      changePatientArchiveState(second.id, { action: "archive", expectedVersion: 1 }, doctor.id),
    ]);
    const [stored] = await db.select().from(patient).where(eq(patient.id, second.id));
    const [pending] = await db
      .select()
      .from(prescription)
      .where(and(eq(prescription.patientId, second.id), eq(prescription.status, "DRAFT")));
    expect(stored?.archivedAt !== null && pending !== undefined).toBe(false);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("coordinates finalization with patient archival under the patient-row lock", async () => {
    await configurePracticeProfile();
    const patientRecord = await createPatient(
      patientInput("Prescription Finalize Archive Race"),
      doctor.id,
    );
    const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    await savePrescriptionDraft(
      draft.id,
      { expectedVersion: 1, consultationId: null, items: [{ medicationName: "Race item" }] },
      doctorActor(),
    );
    const outcomes = await Promise.allSettled([
      finalizePrescription(draft.id, { expectedVersion: 2 }, doctorActor()),
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ]);
    const finalization = outcomes[0];
    expect(finalization?.status).toBe("fulfilled");
    const [storedPrescription] = await db
      .select()
      .from(prescription)
      .where(eq(prescription.id, draft.id));
    expect(storedPrescription?.status).toBe("FINALIZED");
    const [storedPatient] = await db.select().from(patient).where(eq(patient.id, patientRecord.id));
    if (storedPatient?.archivedAt) {
      expect(storedPrescription?.status).toBe("FINALIZED");
    }
  });

  it("keeps medication markers out of audit, logs, secretary responses, and errors", async () => {
    const spies = [
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      await configurePracticeProfile();
      const patientRecord = await createPatient(patientInput("Prescription Privacy"), doctor.id);
      const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
      await savePrescriptionDraft(
        draft.id,
        { expectedVersion: 1, consultationId: null, items: privatePrescriptionItems },
        doctorActor(),
      );
      const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.133");
      const secretaryPayload = JSON.stringify(
        await (
          await getPrescriptionRoute(
            request(`/api/prescriptions/${draft.id}`, {
              method: "GET",
              cookie: secretaryLogin.cookie,
            }),
            prescriptionContext(draft.id),
          )
        ).json(),
      );
      let errorText = "";
      try {
        await savePrescriptionDraft(
          draft.id,
          { expectedVersion: 99, consultationId: null, items: privatePrescriptionItems },
          doctorActor(),
        );
      } catch (error) {
        errorText = error instanceof Error ? error.message : String(error);
      }
      const audit = JSON.stringify(
        (await db.select().from(auditLog).where(eq(auditLog.entityId, draft.id))).map(
          (event) => event.metadata,
        ),
      );
      const logs = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      for (const marker of [
        "TEST_MEDICATION_PRIVATE_78123",
        "TEST_DOSAGE_PRIVATE_91274",
        "TEST_INSTRUCTION_PRIVATE_63182",
      ]) {
        expect(secretaryPayload).not.toContain(marker);
        expect(audit).not.toContain(marker);
        expect(logs).not.toContain(marker);
        expect(errorText).not.toContain(marker);
      }
      expect(
        (
          await listPrescriptionsRoute(
            request("/api/prescriptions", { method: "GET", cookie: secretaryLogin.cookie }),
          )
        ).status,
      ).toBe(403);
      expect(patientRecord.id).toBeDefined();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("generates private historical PDFs and marks issued lifecycle overlays", async () => {
    await configurePracticeProfile();
    const patientRecord = await createPatient(patientInput("PDF History"), doctor.id);
    const draft = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    const saved = await savePrescriptionDraft(
      draft.id,
      { expectedVersion: 1, consultationId: null, items: privatePrescriptionItems },
      doctorActor(),
    );
    const issued = await finalizePrescription(
      draft.id,
      { expectedVersion: saved.version },
      doctorActor(),
    );
    await updatePatientAdministrativeData(
      patientRecord.id,
      { ...patientInput("PDF History Updated"), expectedVersion: patientRecord.version },
      doctor.id,
    );
    await savePracticeProfile(
      {
        clinic: { name: "Synthetic Clinic B", address: "Changed", phone: null, expectedVersion: 1 },
        doctor: {
          displayName: "Dr. Changed",
          specialty: "Changed",
          professionalIdentifier: "SYN-002",
          expectedVersion: 1,
        },
      },
      doctorActor(),
    );
    const doctorLogin = await signIn(doctor.email, doctorPassword, "192.0.2.134");
    const response = await generatePrescriptionPdfRoute(
      request(`/api/prescriptions/${draft.id}/pdf`, { cookie: doctorLogin.cookie, body: {} }),
      prescriptionContext(draft.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="prescription-RX-000001.pdf"',
    );
    const issuedPdfText = await responsePdfText(response);
    expect(issuedPdfText).toContain("Synthetic Clinic A");
    expect(issuedPdfText).toContain("Synthetic PDF History Patient");
    expect(issuedPdfText).not.toContain("Synthetic Clinic B");
    expect(issuedPdfText).not.toContain("Synthetic PDF History Updated Patient");
    expect(issuedPdfText).toContain("TEST_MEDICATION_PRIVATE_78123");
    expect(issuedPdfText).toContain("RX-000001");

    const draftOnly = await createPrescriptionDraft({ patientId: patientRecord.id }, doctorActor());
    const draftResponse = await generatePrescriptionPdfRoute(
      request(`/api/prescriptions/${draftOnly.id}/pdf`, { cookie: doctorLogin.cookie, body: {} }),
      prescriptionContext(draftOnly.id),
    );
    expect(draftResponse.status).toBe(409);
    expect(await draftResponse.text()).not.toContain("TEST_MEDICATION_PRIVATE_78123");

    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.135");
    const secretaryResponse = await generatePrescriptionPdfRoute(
      request(`/api/prescriptions/${draft.id}/pdf`, { cookie: secretaryLogin.cookie, body: {} }),
      prescriptionContext(draft.id),
    );
    expect(secretaryResponse.status).toBe(403);
    expect(await secretaryResponse.text()).not.toContain("TEST_MEDICATION_PRIVATE_78123");
    expect(
      (
        await generatePrescriptionPdfRoute(
          request(`/api/prescriptions/${draft.id}/pdf`, { body: {} }),
          prescriptionContext(draft.id),
        )
      ).status,
    ).toBe(401);

    const voided = await voidPrescription(
      draft.id,
      { expectedVersion: issued.version },
      doctorActor(),
    );
    const voidResponse = await generatePrescriptionPdfRoute(
      request(`/api/prescriptions/${draft.id}/pdf`, { cookie: doctorLogin.cookie, body: {} }),
      prescriptionContext(draft.id),
    );
    expect(voided.status).toBe("VOID");
    expect(await responsePdfText(voidResponse)).toContain("VOID");
    const replacement = await createReplacementPrescription(draft.id, doctorActor());
    const replacementIssued = await finalizePrescription(
      replacement.id,
      { expectedVersion: 1 },
      doctorActor(),
    );
    expect(replacementIssued.status).toBe("FINALIZED");
    const replacedResponse = await generatePrescriptionPdfRoute(
      request(`/api/prescriptions/${draft.id}/pdf`, { cookie: doctorLogin.cookie, body: {} }),
      prescriptionContext(draft.id),
    );
    expect(await responsePdfText(replacedResponse)).toContain("REPLACED / SUPERSEDED");
    const auditEvents = await db.select().from(auditLog).where(eq(auditLog.entityId, draft.id));
    const audit = JSON.stringify(auditEvents.map((event) => event.metadata));
    expect(auditEvents.some((event) => event.action === "PRESCRIPTION_PDF_GENERATED")).toBe(true);
    expect(audit).not.toContain("TEST_MEDICATION_PRIVATE_78123");
  });
});

describe("doctor-only follow-up workflows", () => {
  it("denies every follow-up operation to secretaries and unauthenticated callers", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Authorization"), doctor.id);
    const created = await createFollowUp(
      { patientId: patientRecord.id, dueDate: clinicToday(), reason: privateFollowUpReason },
      doctorActor(),
    );
    const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.121");

    expect((await listFollowUpsRoute(request("/api/follow-ups", { method: "GET" }))).status).toBe(
      401,
    );
    expect(
      (
        await listFollowUpsRoute(
          request("/api/follow-ups", { method: "GET", cookie: secretaryLogin.cookie }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getFollowUpRoute(
          request(`/api/follow-ups/${created.id}`, {
            method: "GET",
            cookie: secretaryLogin.cookie,
          }),
          followUpContext(created.id),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await getFollowUpRoute(
          request(`/api/follow-ups/${created.id}`, { method: "GET" }),
          followUpContext(created.id),
        )
      ).status,
    ).toBe(401);

    for (const operation of [
      () =>
        createFollowUpRoute(
          request("/api/follow-ups", {
            cookie: secretaryLogin.cookie,
            body: { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Private" },
          }),
        ),
      () =>
        updateFollowUpRoute(
          request(`/api/follow-ups/${created.id}/update`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1, dueDate: clinicToday(), reason: "Private" },
          }),
          followUpContext(created.id),
        ),
      () =>
        completeFollowUpRoute(
          request(`/api/follow-ups/${created.id}/complete`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1 },
          }),
          followUpContext(created.id),
        ),
      () =>
        cancelFollowUpRoute(
          request(`/api/follow-ups/${created.id}/cancel`, {
            cookie: secretaryLogin.cookie,
            body: { expectedVersion: 1 },
          }),
          followUpContext(created.id),
        ),
    ]) {
      expect((await operation()).status).toBe(403);
    }

    for (const operation of [
      () =>
        createFollowUpRoute(
          request("/api/follow-ups", {
            body: { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Private" },
          }),
        ),
      () =>
        updateFollowUpRoute(
          request(`/api/follow-ups/${created.id}/update`, {
            body: { expectedVersion: 1, dueDate: clinicToday(), reason: "Private" },
          }),
          followUpContext(created.id),
        ),
      () =>
        completeFollowUpRoute(
          request(`/api/follow-ups/${created.id}/complete`, {
            body: { expectedVersion: 1 },
          }),
          followUpContext(created.id),
        ),
      () =>
        cancelFollowUpRoute(
          request(`/api/follow-ups/${created.id}/cancel`, {
            body: { expectedVersion: 1 },
          }),
          followUpContext(created.id),
        ),
    ]) {
      expect((await operation()).status).toBe(401);
    }
  });

  it("creates for active patients and derives a linked consultation patient", async () => {
    const patientA = await createPatient(patientInput("Follow-up Link A"), doctor.id);
    const patientB = await createPatient(patientInput("Follow-up Link B"), doctor.id);
    const consultationA = await startDirectConsultation({ patientId: patientA.id }, doctorActor());

    const direct = await createFollowUp(
      { patientId: patientA.id, dueDate: clinicToday(), reason: "Direct review" },
      doctorActor(),
    );
    const linked = await createFollowUp(
      {
        consultationId: consultationA.id,
        dueDate: nextCalendarDate(clinicToday()),
        reason: "Linked review",
      },
      doctorActor(),
    );
    const [linkedRecord] = await db.select().from(followUp).where(eq(followUp.id, linked.id));
    expect(direct).toMatchObject({ status: "PENDING", version: 1 });
    expect(linkedRecord).toMatchObject({
      patientId: patientA.id,
      consultationId: consultationA.id,
    });

    await expect(
      db.insert(followUp).values({
        patientId: patientB.id,
        consultationId: consultationA.id,
        createdBy: doctor.id,
        dueDate: clinicToday(),
        reason: "Invalid cross-patient link",
      }),
    ).rejects.toThrow();

    const saved = await saveClinicalNoteRevision(
      consultationA.id,
      { expectedVersion: 1, ...privateClinicalFields },
      doctorActor(),
    );
    await finalizeConsultation(consultationA.id, { expectedVersion: saved.version }, doctorActor());
    const [finalizedBefore] = await db
      .select()
      .from(consultation)
      .where(eq(consultation.id, consultationA.id));
    await expect(
      createFollowUp(
        {
          consultationId: consultationA.id,
          dueDate: nextCalendarDate(clinicToday()),
          reason: "Finalized consultation review",
        },
        doctorActor(),
      ),
    ).resolves.toMatchObject({ status: "PENDING" });
    const [finalizedAfter] = await db
      .select()
      .from(consultation)
      .where(eq(consultation.id, consultationA.id));
    expect(finalizedAfter).toEqual(finalizedBefore);
    expect(
      await db
        .select()
        .from(clinicalNoteRevision)
        .where(eq(clinicalNoteRevision.consultationId, consultationA.id)),
    ).toHaveLength(1);
  });

  it("rejects archived patients and application-created past due dates", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Invalid"), doctor.id);
    await expect(
      createFollowUp(
        {
          patientId: patientRecord.id,
          dueDate: shiftCalendarDate(clinicToday(), -1),
          reason: "Past review",
        },
        doctorActor(),
      ),
    ).rejects.toThrow(/past/);
    await changePatientArchiveState(
      patientRecord.id,
      { action: "archive", expectedVersion: 1 },
      doctor.id,
    );
    await expect(
      createFollowUp(
        { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Archived review" },
        doctorActor(),
      ),
    ).rejects.toThrow(/Archived patients/);
  });

  it("edits pending records and permits exactly one concurrent terminal transition", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Lifecycle"), doctor.id);
    const created = await createFollowUp(
      { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Initial review" },
      doctorActor(),
    );
    const updated = await updatePendingFollowUp(
      created.id,
      {
        expectedVersion: 1,
        dueDate: nextCalendarDate(clinicToday()),
        reason: "Corrected review",
      },
      doctorActor(),
    );
    expect(updated).toMatchObject({ status: "PENDING", version: 2 });

    const outcomes = await Promise.allSettled([
      completeFollowUp(created.id, { expectedVersion: 2 }, doctorActor()),
      cancelFollowUp(created.id, { expectedVersion: 2 }, doctorActor()),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const [stored] = await db.select().from(followUp).where(eq(followUp.id, created.id));
    expect(["COMPLETED", "CANCELLED"]).toContain(stored?.status);
    expect(stored?.version).toBe(3);
    await expect(
      updatePendingFollowUp(
        created.id,
        {
          expectedVersion: 3,
          dueDate: nextCalendarDate(clinicToday()),
          reason: "Forbidden terminal edit",
        },
        doctorActor(),
      ),
    ).rejects.toThrow(/Terminal/);
    await expect(
      completeFollowUp(created.id, { expectedVersion: 3 }, doctorActor()),
    ).rejects.toThrow(/terminal/);

    const terminalEvents = (
      await db.select().from(auditLog).where(eq(auditLog.entityId, created.id))
    ).filter(
      (event) => event.action === "FOLLOW_UP_COMPLETED" || event.action === "FOLLOW_UP_CANCELLED",
    );
    expect(terminalEvents).toHaveLength(1);
  });

  it("classifies DATE values as overdue, due today, and upcoming without UTC shifts", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Dates"), doctor.id);
    const today = "2026-09-10";
    await db.insert(followUp).values([
      {
        patientId: patientRecord.id,
        createdBy: doctor.id,
        dueDate: "2026-09-09",
        reason: "Overdue",
      },
      {
        patientId: patientRecord.id,
        createdBy: doctor.id,
        dueDate: today,
        reason: "Due today",
      },
      {
        patientId: patientRecord.id,
        createdBy: doctor.id,
        dueDate: "2026-09-11",
        reason: "Upcoming",
      },
    ]);
    const groups = await listOperationalFollowUps(today);
    expect(groups.overdue.map((item) => item.dueDate)).toEqual(["2026-09-09"]);
    expect(groups.dueToday.map((item) => item.dueDate)).toEqual([today]);
    expect(groups.upcoming.map((item) => item.dueDate)).toEqual(["2026-09-11"]);
  });

  it("blocks archival only while a follow-up is pending", async () => {
    for (const targetStatus of ["COMPLETED", "CANCELLED"] as const) {
      const patientRecord = await createPatient(
        patientInput(`Follow-up Archive ${targetStatus}`),
        doctor.id,
      );
      const created = await createFollowUp(
        { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Archive gate" },
        doctorActor(),
      );
      await expect(
        changePatientArchiveState(
          patientRecord.id,
          { action: "archive", expectedVersion: 1 },
          doctor.id,
        ),
      ).rejects.toThrow(/pending follow-ups/);
      if (targetStatus === "COMPLETED") {
        await completeFollowUp(created.id, { expectedVersion: 1 }, doctorActor());
      } else {
        await cancelFollowUp(created.id, { expectedVersion: 1 }, doctorActor());
      }
      await expect(
        updatePendingFollowUp(
          created.id,
          {
            expectedVersion: 2,
            dueDate: clinicToday(),
            reason: "Forbidden terminal correction",
          },
          doctorActor(),
        ),
      ).rejects.toThrow(/Terminal/);
      await expect(
        targetStatus === "COMPLETED"
          ? cancelFollowUp(created.id, { expectedVersion: 2 }, doctorActor())
          : completeFollowUp(created.id, { expectedVersion: 2 }, doctorActor()),
      ).rejects.toThrow(/terminal/);
      await expect(
        changePatientArchiveState(
          patientRecord.id,
          { action: "archive", expectedVersion: 1 },
          doctor.id,
        ),
      ).resolves.toMatchObject({ archivedAt: expect.any(Date) });
    }
  });

  it("cannot race pending creation into an archived patient", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Archive Race"), doctor.id);
    const outcomes = await Promise.allSettled([
      createFollowUp(
        { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Race review" },
        doctorActor(),
      ),
      changePatientArchiveState(
        patientRecord.id,
        { action: "archive", expectedVersion: 1 },
        doctor.id,
      ),
    ]);
    const [storedPatient] = await db.select().from(patient).where(eq(patient.id, patientRecord.id));
    const pending = await db
      .select()
      .from(followUp)
      .where(and(eq(followUp.patientId, patientRecord.id), eq(followUp.status, "PENDING")));
    expect(storedPatient?.archivedAt !== null && pending.length > 0).toBe(false);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  });

  it("enforces lifecycle metadata, terminal immutability, versioning, and no deletion", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Constraints"), doctor.id);
    await expect(
      db.insert(followUp).values({
        patientId: patientRecord.id,
        createdBy: doctor.id,
        dueDate: clinicToday(),
        reason: "Invalid lifecycle",
        status: "COMPLETED",
      }),
    ).rejects.toThrow();
    const created = await createFollowUp(
      { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Protected record" },
      doctorActor(),
    );
    await expect(
      db
        .update(followUp)
        .set({ reason: "No version increment" })
        .where(eq(followUp.id, created.id)),
    ).rejects.toThrow();
    await completeFollowUp(created.id, { expectedVersion: 1 }, doctorActor());
    await expect(
      db
        .update(followUp)
        .set({ reason: "Terminal mutation", version: sql`${followUp.version} + 1` })
        .where(eq(followUp.id, created.id)),
    ).rejects.toThrow();
    await expect(db.delete(followUp).where(eq(followUp.id, created.id))).rejects.toThrow();
  });

  it("keeps sensitive reasons out of audit, administrative DTOs, secretary responses, errors, and logs", async () => {
    const logSpies = [
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    try {
      const patientRecord = await createPatient(patientInput("Privacy Marker"), doctor.id);
      const created = await createFollowUp(
        { patientId: patientRecord.id, dueDate: clinicToday(), reason: privateFollowUpReason },
        doctorActor(),
      );
      const secretaryLogin = await signIn(secretary.email, secretaryPassword, "192.0.2.122");
      const secretaryFollowUp = await getFollowUpRoute(
        request(`/api/follow-ups/${created.id}`, {
          method: "GET",
          cookie: secretaryLogin.cookie,
        }),
        followUpContext(created.id),
      );
      const secretaryPatient = await getPatient(
        request(`/api/patients/${patientRecord.id}`, {
          method: "GET",
          cookie: secretaryLogin.cookie,
        }),
        patientContext(patientRecord.id),
      );
      let staleError = "";
      try {
        await updatePendingFollowUp(
          created.id,
          { expectedVersion: 99, dueDate: clinicToday(), reason: privateFollowUpReason },
          doctorActor(),
        );
      } catch (error) {
        staleError = error instanceof Error ? error.message : String(error);
      }

      const audit = JSON.stringify(
        (await db.select().from(auditLog).where(eq(auditLog.entityId, created.id))).map(
          (event) => event.metadata,
        ),
      );
      const patientPayload = JSON.stringify(await secretaryPatient.json());
      const secretaryPayload = JSON.stringify(await secretaryFollowUp.json());
      const logs = JSON.stringify(logSpies.flatMap((spy) => spy.mock.calls));
      for (const value of [audit, patientPayload, secretaryPayload, staleError, logs]) {
        expect(value).not.toContain("TEST_FOLLOWUP_PRIVATE_72194");
      }
      expect(patientPayload).not.toMatch(/follow.?up/i);
      expect(secretaryFollowUp.status).toBe(403);
    } finally {
      for (const spy of logSpies) spy.mockRestore();
    }
  });

  it("returns private no-store follow-up responses", async () => {
    const patientRecord = await createPatient(patientInput("Follow-up Cache"), doctor.id);
    const login = await signIn(doctor.email, doctorPassword, "192.0.2.123");
    const createdResponse = await createFollowUpRoute(
      request("/api/follow-ups", {
        cookie: login.cookie,
        body: { patientId: patientRecord.id, dueDate: clinicToday(), reason: "Cache review" },
      }),
    );
    const id = await responseFollowUpId(createdResponse);
    const detail = await getFollowUpRoute(
      request(`/api/follow-ups/${id}`, { method: "GET", cookie: login.cookie }),
      followUpContext(id),
    );
    expect(createdResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(detail.headers.get("cache-control")).toBe("private, no-store");
    expect(detail.headers.get("pragma")).toBe("no-cache");
  });
});
