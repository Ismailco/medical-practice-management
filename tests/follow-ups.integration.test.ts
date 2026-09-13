import { describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  setupIntegrationFixtures,
  cancelFollowUpRoute,
  completeFollowUpRoute,
  getFollowUpRoute,
  updateFollowUpRoute,
  listFollowUpsRoute,
  createFollowUpRoute,
  getPatient,
  db,
  auditLog,
  clinicalNoteRevision,
  consultation,
  followUp,
  patient,
  clinicToday,
  nextCalendarDate,
  finalizeConsultation,
  saveClinicalNoteRevision,
  startDirectConsultation,
  listOperationalFollowUps,
  cancelFollowUp,
  completeFollowUp,
  createFollowUp,
  updatePendingFollowUp,
  changePatientArchiveState,
  createPatient,
  doctorPassword,
  secretaryPassword,
  doctor,
  secretary,
  request,
  signIn,
  patientInput,
  patientContext,
  doctorActor,
  followUpContext,
  responseFollowUpId,
  privateClinicalFields,
  privateFollowUpReason,
  shiftCalendarDate,
} from "./integration-fixtures";

setupIntegrationFixtures();

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
