import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
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
import { account, appointment, auditLog, loginThrottle, patient, session, user } from "@/db/schema";
import { getCurrentSession } from "@/modules/auth/session";
import { listPatientAppointments } from "@/modules/appointments/repository";
import { searchAdministrativePatients } from "@/modules/patients/repository";
import {
  changePatientArchiveState,
  createPatient,
  updatePatientAdministrativeData,
} from "@/modules/patients/service";
import { createInitialDoctor, createSecretary, resetDoctorPassword } from "@/modules/users/service";

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
  await sqlClient`
    TRUNCATE TABLE
      audit_log,
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
