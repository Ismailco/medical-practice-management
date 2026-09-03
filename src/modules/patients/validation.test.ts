import { describe, expect, it } from "vitest";

import {
  normalizePhone,
  patientAdministrativeInputSchema,
  patientListQuerySchema,
  patientSearchInputSchema,
  patientUpdateInputSchema,
} from "./validation";

const validPatient = {
  firstName: " أمينة ",
  lastName: " El  Mansouri ",
  dateOfBirth: "1990-02-28",
  phone: " +212 (0) 612-345-678 ",
  email: " FAMILY@EXAMPLE.TEST ",
  address: " 10 rue synthétique ",
  emergencyContactName: " Élodie  Exemple ",
  emergencyContactPhone: " 01 23 45 67 89 ",
};

describe("patient administrative validation", () => {
  it("preserves Unicode names while normalizing whitespace and optional fields", () => {
    expect(patientAdministrativeInputSchema.parse(validPatient)).toEqual({
      firstName: "أمينة",
      lastName: "El Mansouri",
      dateOfBirth: "1990-02-28",
      phone: "+212 (0) 612-345-678",
      email: "family@example.test",
      address: "10 rue synthétique",
      emergencyContactName: "Élodie Exemple",
      emergencyContactPhone: "01 23 45 67 89",
    });
    expect(normalizePhone("+212 (0) 612-345-678")).toBe("+2120612345678");
  });

  it("rejects impossible and future birth dates", () => {
    expect(
      patientAdministrativeInputSchema.safeParse({
        ...validPatient,
        dateOfBirth: "2025-02-29",
      }).success,
    ).toBe(false);
    expect(
      patientAdministrativeInputSchema.safeParse({
        ...validPatient,
        dateOfBirth: "2999-01-01",
      }).success,
    ).toBe(false);
  });

  it("stores blank optional fields as null", () => {
    expect(
      patientAdministrativeInputSchema.parse({
        firstName: "Synthetic",
        lastName: "Patient",
        dateOfBirth: "2000-01-01",
        phone: "   ",
        email: "",
        address: " \n ",
        emergencyContactName: "",
        emergencyContactPhone: "",
      }),
    ).toMatchObject({
      phone: null,
      email: null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    });
  });

  it("normalizes blank optional values to null", () => {
    const result = patientAdministrativeInputSchema.parse({
      ...validPatient,
      phone: " ",
      email: "",
      address: null,
      emergencyContactName: undefined,
      emergencyContactPhone: " ",
    });
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.address).toBeNull();
    expect(result.emergencyContactName).toBeNull();
    expect(result.emergencyContactPhone).toBeNull();
  });

  it("rejects invalid and future calendar dates", () => {
    expect(
      patientAdministrativeInputSchema.safeParse({
        ...validPatient,
        dateOfBirth: "2025-02-29",
      }).success,
    ).toBe(false);
    expect(
      patientAdministrativeInputSchema.safeParse({
        ...validPatient,
        dateOfBirth: "2999-01-01",
      }).success,
    ).toBe(false);
  });

  it("rejects clinical, role, patient-number, and unknown fields", () => {
    for (const maliciousField of [
      "role",
      "patientNumber",
      "diagnosis",
      "clinicalNotes",
      "prescriptions",
    ]) {
      expect(
        patientAdministrativeInputSchema.safeParse({
          ...validPatient,
          [maliciousField]: "must not be accepted",
        }).success,
      ).toBe(false);
    }
  });

  it("requires a bounded positive concurrency version", () => {
    expect(
      patientUpdateInputSchema.safeParse({ ...validPatient, expectedVersion: 1 }).success,
    ).toBe(true);
    expect(
      patientUpdateInputSchema.safeParse({ ...validPatient, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      patientUpdateInputSchema.safeParse({ ...validPatient, expectedVersion: 1.5 }).success,
    ).toBe(false);
  });

  it("bounds search and pagination input", () => {
    expect(patientListQuerySchema.parse({})).toEqual({ page: 1, includeArchived: false });
    expect(patientListQuerySchema.safeParse({ page: "10001" }).success).toBe(false);
    expect(patientSearchInputSchema.safeParse({ q: "%_", unexpected: "value" }).success).toBe(
      false,
    );
  });
});
