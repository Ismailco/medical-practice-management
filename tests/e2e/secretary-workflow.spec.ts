import { expect, test, type Page } from "@playwright/test";

async function api(page: Page, path: string, body: unknown, method = "POST") {
  return page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.json().catch(() => null),
      };
    },
    { path, body, method },
  );
}

test("secretary has administrative access only", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e.secretary@example.test");
  await page.getByLabel("Password").fill("E2eSecretaryPassword-2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Patients" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Follow-ups" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Prescriptions" })).toHaveCount(0);
  const patientResponse = await api(page, "/api/patients", {
    firstName: "Secretary",
    lastName: "Workflow",
    dateOfBirth: "1992-02-02",
    phone: "+212 600 222 333",
    email: "e2e.secretary.workflow@example.test",
    address: "Synthetic",
    emergencyContactName: null,
    emergencyContactPhone: null,
  });
  expect(patientResponse.ok).toBeTruthy();
  const patient = patientResponse.body.patient;
  const updated = await api(
    page,
    `/api/patients/${patient.id}`,
    {
      firstName: "Secretary Updated",
      lastName: "Workflow",
      dateOfBirth: "1992-02-02",
      phone: "+212 600 222 333",
      email: "e2e.secretary.workflow@example.test",
      address: "Synthetic",
      emergencyContactName: null,
      emergencyContactPhone: null,
      expectedVersion: patient.version,
    },
    "PATCH",
  );
  expect(updated.ok).toBeTruthy();
  const appointment = await api(page, "/api/appointments", {
    patientId: patient.id,
    localDate: "2099-02-02",
    localStartTime: "10:00",
    durationMinutes: 30,
    administrativeReason: "Synthetic admin visit",
    allowOverlap: false,
  });
  expect(appointment.ok).toBeTruthy();
  const appointmentRecord = appointment.body.appointment;
  const rescheduled = await api(
    page,
    `/api/appointments/${appointmentRecord.id}`,
    {
      localDate: "2099-02-02",
      localStartTime: "10:30",
      durationMinutes: 30,
      administrativeReason: "Synthetic admin visit",
      allowOverlap: false,
      expectedVersion: appointmentRecord.version,
    },
    "PATCH",
  );
  expect(rescheduled.ok).toBeTruthy();
  const arrived = await api(
    page,
    `/api/appointments/${appointmentRecord.id}/transition`,
    { targetStatus: "ARRIVED", expectedVersion: rescheduled.body.appointment.version },
    "PATCH",
  );
  expect(arrived.ok).toBeTruthy();
  for (const path of [
    "/consultations",
    "/follow-ups",
    "/prescriptions",
    "/settings/users",
    "/settings/practice",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  const denied = await page.request.get("/api/prescriptions");
  expect([401, 403]).toContain(denied.status());
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
