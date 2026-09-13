import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  setupIntegrationFixtures,
  getPatient,
  updatePatientRoute,
  changePatientLifecycle,
  listPatients,
  createPatientRoute,
  searchPatients,
  db,
  auditLog,
  patient,
  searchAdministrativePatients,
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
  patientContext,
} from "./integration-fixtures";

setupIntegrationFixtures();

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
