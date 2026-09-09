import { describe, expect, it } from "vitest";

import {
  PRESCRIPTION_TEMPLATE_V1,
  PRESCRIPTION_TEMPLATE_V2,
  PRESCRIPTION_TEMPLATE_V3,
  UnsupportedPrescriptionTemplateError,
  renderPrescription,
  type IssuedPrescriptionDocumentData,
} from "./pdf";

const SYNTHETIC_LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fixture(
  overrides: Partial<IssuedPrescriptionDocumentData> = {},
): IssuedPrescriptionDocumentData {
  return {
    prescriptionNumber: "RX-000123",
    issueDate: "2026-09-08",
    status: "FINALIZED",
    isReplaced: false,
    templateVersion: PRESCRIPTION_TEMPLATE_V1,
    patient: { number: "P-0001", name: "Patient Original", dateOfBirth: "1988-01-02" },
    doctor: {
      name: "Dr. François Médical",
      nameArabic: null,
      specialty: "Médecin",
      specialtyArabic: null,
      professionalIdentifier: "DOC-1",
      socialMedia: null,
    },
    clinic: {
      name: "Clinique Santé",
      nameArabic: null,
      address: "1 Rue de l'Hôpital",
      addressArabic: null,
      city: null,
      cityArabic: null,
      phone: "+212 500",
      phoneSecondary: null,
      email: null,
      logoDataUrl: null,
    },
    items: [
      {
        position: 0,
        medicationName: "Crème TEST_PDF_MED_PRIVATE_45821",
        dosage: "1 application",
        form: "Crème",
        frequency: "Deux fois par jour",
        duration: "7 jours",
        quantity: "1 tube",
        route: "Topique",
        instructions: "Apply gently.",
      },
    ],
    ...overrides,
  };
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

function containsRenderedText(pdf: Buffer, value: string): boolean {
  const decodedText = [...pdf.toString("latin1").matchAll(/<([0-9a-f]+)>/g)]
    .map((match) => (match[1] ? Buffer.from(match[1], "hex").toString("latin1") : ""))
    .join("");
  return decodedText.includes(value);
}

describe("prescription PDF renderer", () => {
  it("renders an A4 PDF from immutable document data", async () => {
    const result = await renderPrescription(fixture());
    const text = result.bytes.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(containsRenderedText(result.bytes, "RX-000123")).toBe(true);
    expect(containsRenderedText(result.bytes, "TEST_PDF_MED_PRIVATE_45821")).toBe(true);
    expect(result.pageCount).toBe(1);
    expect(pageCount(result.bytes)).toBe(1);
    expect(text).toContain("Prescription document");
  });

  it("renders the current Moroccan bilingual template with the saved profile logo", async () => {
    const result = await renderPrescription(
      fixture({
        templateVersion: PRESCRIPTION_TEMPLATE_V3,
        doctor: {
          name: "Dr. Synthetic Doctor",
          nameArabic: "الدكتور طبيب تجريبي",
          specialty: "Dermatology\nVenereology",
          specialtyArabic: "اختصاصي في الأمراض الجلدية\nالأمراض المنقولة جنسيا",
          professionalIdentifier: "DOC-SYNTHETIC-1",
          socialMedia: "Instagram: @synthetic.practice",
        },
        clinic: {
          name: "Cabinet Synthetic",
          nameArabic: "عيادة تجريبية",
          address: "1 Avenue de Test",
          addressArabic: "شارع الاختبار رقم 1",
          city: "Meknes",
          cityArabic: "مكناس",
          phone: "+212 500 000 000",
          phoneSecondary: "+212 600 000 000",
          email: "clinic@example.test",
          logoDataUrl: SYNTHETIC_LOGO_DATA_URL,
        },
      }),
    );
    expect(result.bytes.toString("latin1").startsWith("%PDF-")).toBe(true);
    expect(result.pageCount).toBe(1);
    expect(containsRenderedText(result.bytes, "ORDONNANCE")).toBe(true);
    expect(containsRenderedText(result.bytes, "08/09/2026")).toBe(true);
    expect(containsRenderedText(result.bytes, "Instagram: @synthetic.practice")).toBe(true);
    expect(containsRenderedText(result.bytes, "Patient number:")).toBe(false);
    expect(containsRenderedText(result.bytes, "Date of birth:")).toBe(false);
    expect(containsRenderedText(result.bytes, "Prescription")).toBe(false);
    expect(containsRenderedText(result.bytes, "Physician signature / stamp:")).toBe(false);
  });

  it("continues rendering the previous Moroccan template version", async () => {
    const result = await renderPrescription(fixture({ templateVersion: PRESCRIPTION_TEMPLATE_V2 }));
    expect(result.pageCount).toBe(1);
    expect(containsRenderedText(result.bytes, "Patient")).toBe(true);
  });

  it("supports multiple pages without dropping ordered items", async () => {
    const items = Array.from({ length: 35 }, (_, position) => ({
      position,
      medicationName: `Medication ${position + 1}`,
      dosage: "10 mg",
      form: "Tablet",
      frequency: "Once daily",
      duration: "30 days",
      quantity: "30",
      route: "Oral",
      instructions:
        "Take with water. This is a deliberately long instruction for pagination testing.",
    }));
    const result = await renderPrescription(fixture({ items }));
    expect(result.pageCount).toBeGreaterThan(1);
    expect(pageCount(result.bytes)).toBe(result.pageCount);
    expect(containsRenderedText(result.bytes, "Medication 1")).toBe(true);
    expect(containsRenderedText(result.bytes, "Medication 35")).toBe(true);
    expect(containsRenderedText(result.bytes, "Physician signature / stamp:")).toBe(true);
  });

  it("marks void and replaced documents without changing source fields", async () => {
    const result = await renderPrescription(fixture({ status: "VOID", isReplaced: true }));
    expect(containsRenderedText(result.bytes, "VOID")).toBe(true);
    expect(containsRenderedText(result.bytes, "NOT VALID FOR USE")).toBe(true);
    expect(containsRenderedText(result.bytes, "REPLACED / SUPERSEDED")).toBe(true);
    expect(containsRenderedText(result.bytes, "TEST_PDF_MED_PRIVATE_45821")).toBe(true);
  });

  it("fails closed for an unknown renderer version", async () => {
    await expect(
      renderPrescription(fixture({ templateVersion: "future-v99" })),
    ).rejects.toBeInstanceOf(UnsupportedPrescriptionTemplateError);
  });
});
