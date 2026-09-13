import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  setupIntegrationFixtures,
  getAppointment,
  rescheduleAppointmentRoute,
  transitionAppointmentRoute,
  listAppointments,
  createAppointmentRoute,
  db,
  appointment,
  auditLog,
  listPatientAppointments,
  changePatientArchiveState,
  createPatient,
  doctorPassword,
  secretaryPassword,
  doctor,
  secretary,
  request,
  signIn,
  patientInput,
  appointmentContext,
  appointmentInput,
  responseAppointmentId,
} from "./integration-fixtures";

setupIntegrationFixtures();

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
