import { expect, test, type Page } from "@playwright/test";

const doctor = { email: "e2e.doctor@example.test", password: "E2eDoctorPassword-2026!" };

async function api(page: Page, path: string, body?: unknown, method = "POST") {
  return page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
        headers: Object.fromEntries(response.headers.entries()),
      };
    },
    { path, body, method },
  );
}

test("doctor can complete the core clinical and prescription workflow", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(doctor.email);
  await page.getByLabel("Password").fill(doctor.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Prescriptions" })).toBeVisible();

  const patientResponse = await api(page, "/api/patients", {
    firstName: "E2E",
    lastName: "Workflow",
    dateOfBirth: "1990-01-01",
    phone: "+212 600 111 222",
    email: "e2e.workflow@example.test",
    address: "Synthetic",
    emergencyContactName: null,
    emergencyContactPhone: null,
  });
  expect(patientResponse.ok).toBeTruthy();
  const patient = patientResponse.body.patient;
  const searchResponse = await api(page, "/api/patients/search", {
    q: "E2E Workflow",
    page: 1,
    includeArchived: false,
  });
  expect(searchResponse.ok).toBeTruthy();
  const updateResponse = await api(
    page,
    `/api/patients/${patient.id}`,
    {
      firstName: "E2E Updated",
      lastName: "Workflow",
      dateOfBirth: "1990-01-01",
      phone: "+212 600 111 222",
      email: "e2e.workflow@example.test",
      address: "Synthetic",
      emergencyContactName: null,
      emergencyContactPhone: null,
      expectedVersion: patient.version,
    },
    "PATCH",
  );
  expect(updateResponse.ok).toBeTruthy();
  const appointmentResponse = await api(page, "/api/appointments", {
    patientId: patient.id,
    localDate: "2099-01-01",
    localStartTime: "09:00",
    durationMinutes: 30,
    administrativeReason: "E2E test",
    allowOverlap: false,
  });
  expect(appointmentResponse.ok).toBeTruthy();
  const appointment = appointmentResponse.body.appointment;
  const arrivedResponse = await api(
    page,
    `/api/appointments/${appointment.id}/transition`,
    { targetStatus: "ARRIVED", expectedVersion: appointment.version },
    "PATCH",
  );
  expect(arrivedResponse.ok).toBeTruthy();
  const consultationResponse = await api(page, "/api/consultations", {
    patientId: patient.id,
  });
  expect(consultationResponse.ok).toBeTruthy();
  const consultation = consultationResponse.body.consultation;
  const revisionResponse = await api(page, `/api/consultations/${consultation.id}/revisions`, {
    expectedVersion: consultation.version,
    reasonForVisit: "Synthetic E2E visit",
    observations: "Synthetic E2E clinical note.",
    diagnosis: null,
    notes: null,
  });
  expect(revisionResponse.ok).toBeTruthy();
  const revision = revisionResponse.body.consultation;
  const finalResponse = await api(page, `/api/consultations/${consultation.id}/finalize`, {
    expectedVersion: revision.version,
  });
  expect(finalResponse.ok).toBeTruthy();
  const followUpResponse = await api(page, "/api/follow-ups", {
    consultationId: consultation.id,
    dueDate: "2099-01-02",
    reason: "E2E review",
  });
  expect(followUpResponse.ok).toBeTruthy();
  const followUp = followUpResponse.body.followUp;
  const prescriptionResponse = await api(page, "/api/prescriptions", {
    consultationId: consultation.id,
  });
  expect(prescriptionResponse.ok).toBeTruthy();
  const prescription = prescriptionResponse.body.prescription;
  const saveResponse = await api(page, `/api/prescriptions/${prescription.id}/save`, {
    expectedVersion: prescription.version,
    consultationId: consultation.id,
    items: [
      {
        medicationName: "TEST_E2E_DOCUMENTATION_ONLY",
        dosage: "once",
        form: "tablet",
        frequency: "daily",
        duration: "7 days",
        quantity: "7",
        route: "oral",
        instructions: "Synthetic test data",
      },
    ],
  });
  expect(saveResponse.ok).toBeTruthy();
  const saved = saveResponse.body.prescription;
  const finalizeResponse = await api(page, `/api/prescriptions/${prescription.id}/finalize`, {
    expectedVersion: saved.version,
  });
  expect(finalizeResponse.ok).toBeTruthy();
  const finalized = finalizeResponse.body.prescription;
  const pdfResponse = await api(page, `/api/prescriptions/${prescription.id}/pdf`);
  expect(pdfResponse.ok).toBeTruthy();
  expect(pdfResponse.headers["content-type"]).toContain("application/pdf");
  expect(finalized.status).toBe("FINALIZED");
  await expect(page.getByRole("link", { name: "Follow-ups", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(followUp.id).toBeTruthy();
});
