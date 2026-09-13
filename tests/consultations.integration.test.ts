import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  setupIntegrationFixtures,
  addendumRoute,
  finalizeConsultationRoute,
  saveRevisionRoute,
  getConsultation,
  startFromAppointmentRoute,
  listConsultationsRoute,
  startDirectRoute,
  transitionAppointmentRoute,
  createAppointmentRoute,
  db,
  appointment,
  auditLog,
  clinicalNoteAddendum,
  clinicalNoteRevision,
  consultation,
  patient,
  listPatientAppointments,
  addClinicalAddendum,
  finalizeConsultation,
  saveClinicalNoteRevision,
  startConsultationFromAppointment,
  startDirectConsultation,
  searchAdministrativePatients,
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
  consultationContext,
  doctorActor,
  responseConsultationId,
  privateClinicalFields,
} from "./integration-fixtures";

setupIntegrationFixtures();

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
