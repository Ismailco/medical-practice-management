import { expect, test, type Page } from "@playwright/test";

const doctor = { email: "e2e.doctor@example.test", password: "E2eDoctorPassword-2026!" };

async function api(page: Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: response.ok, status: response.status, body: await response.json() };
    },
    { path, body },
  );
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(doctor.email);
  await page.getByLabel("Password").fill(doctor.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("appointment overlap restores focus for create and reschedule", async ({ page }) => {
  await signIn(page);

  const patientResponse = await api(page, "/api/patients", {
    firstName: "Overlap Focus",
    lastName: "Patient",
    dateOfBirth: "1991-06-06",
    phone: null,
    email: "overlap.focus@example.test",
    address: "Synthetic",
    emergencyContactName: null,
    emergencyContactPhone: null,
  });
  expect(patientResponse.ok).toBeTruthy();
  const patient = patientResponse.body.patient;

  const appointmentResponse = await api(page, "/api/appointments", {
    patientId: patient.id,
    localDate: "2099-05-01",
    localStartTime: "09:00",
    durationMinutes: 30,
    administrativeReason: "Synthetic overlap focus test",
    allowOverlap: false,
  });
  expect(appointmentResponse.ok).toBeTruthy();
  const appointment = appointmentResponse.body.appointment;

  await page.goto("/appointments/new");
  await page.getByLabel("Patient").fill("Overlap Focus");
  await page.getByRole("button", { name: /Overlap Focus Patient/ }).click();
  await page.getByLabel("Date").fill("2099-05-01");
  await page.getByLabel("Start time").fill("09:15");
  await page.getByRole("button", { name: "Schedule appointment" }).click();

  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Schedule appointment" })).toBeFocused();

  await page.getByRole("button", { name: "Schedule appointment" }).click();
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Schedule appointment" })).toBeFocused();

  const secondPatientResponse = await api(page, "/api/patients", {
    firstName: "Overlap Existing",
    lastName: "Patient",
    dateOfBirth: "1992-07-07",
    phone: null,
    email: "overlap.existing@example.test",
    address: "Synthetic",
    emergencyContactName: null,
    emergencyContactPhone: null,
  });
  expect(secondPatientResponse.ok).toBeTruthy();
  const secondPatient = secondPatientResponse.body.patient;
  const secondAppointmentResponse = await api(page, "/api/appointments", {
    patientId: secondPatient.id,
    localDate: "2099-05-01",
    localStartTime: "09:30",
    durationMinutes: 30,
    administrativeReason: "Synthetic reschedule overlap",
    allowOverlap: true,
  });
  expect(secondAppointmentResponse.ok).toBeTruthy();

  await page.goto(`/appointments/${appointment.id}/edit`);
  await page.getByLabel("Start time").fill("09:15");
  await page.getByRole("button", { name: "Save changes" }).click();

  const rescheduleDialog = page.getByRole("dialog");
  await expect(rescheduleDialog).toBeVisible();
  await expect(rescheduleDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeFocused();
});
