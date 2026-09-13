import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  setupIntegrationFixtures,
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
  db,
  auditLog,
  patient,
  prescription,
  prescriptionIssueSnapshot,
  prescriptionItem,
  startDirectConsultation,
  findPrescriptionDetail,
  createPrescriptionDraft,
  createReplacementPrescription,
  duplicatePrescription,
  finalizePrescription,
  savePrescriptionDraft,
  savePracticeProfile,
  voidPrescription,
  changePatientArchiveState,
  createPatient,
  updatePatientAdministrativeData,
  doctorPassword,
  secretaryPassword,
  doctor,
  secretary,
  request,
  signIn,
  patientInput,
  doctorActor,
  prescriptionContext,
  configurePracticeProfile,
  privatePrescriptionItems,
  responsePdfText,
} from "./integration-fixtures";

setupIntegrationFixtures();

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
