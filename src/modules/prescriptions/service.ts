import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  auditLog,
  clinicProfile,
  consultation,
  doctorProfessionalProfile,
  patient,
  prescription,
  prescriptionCounter,
  prescriptionIssueSnapshot,
  prescriptionItem,
} from "@/db/schema";
import { clinicToday } from "@/modules/appointments/timezone";
import { ConflictError, NotFoundError } from "@/modules/auth/errors";
import type { SafeUser } from "@/modules/auth/session";
import { findIssuedPrescriptionDocumentData, findPrescriptionDetail } from "./repository";
import { PRESCRIPTION_TEMPLATE_V3, renderPrescription } from "./pdf";
import {
  practiceProfileInputSchema,
  prescriptionCreationInputSchema,
  prescriptionDraftSaveInputSchema,
  prescriptionExpectedVersionSchema,
  type PrescriptionItemInput,
} from "./validation";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PrescriptionMutationResult = Readonly<{
  id: string;
  status: "DRAFT" | "FINALIZED" | "VOID";
  version: number;
  prescriptionNumber: string | null;
}>;

export type PrescriptionPdfResult = Readonly<{
  bytes: Buffer;
  filename: string;
  pageCount: number;
}>;

export async function generatePrescriptionPdf(
  id: string,
  actor: SafeUser,
): Promise<PrescriptionPdfResult> {
  const detail = await findPrescriptionDetail(id);
  if (!detail) throw new NotFoundError();
  if (detail.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
  if (detail.status === "DRAFT") {
    throw new ConflictError("Only issued prescriptions can generate a PDF.");
  }
  const data = await findIssuedPrescriptionDocumentData(id);
  if (!data) throw new ConflictError("This issued prescription cannot be rendered safely.");
  const rendered = await renderPrescription(data);
  await db.insert(auditLog).values({
    actorUserId: actor.id,
    action: "PRESCRIPTION_PDF_GENERATED",
    entityType: "prescription",
    entityId: id,
    metadata: {
      status: data.status,
      rendererVersion: data.templateVersion,
      replaced: data.isReplaced,
      pageCount: rendered.pageCount,
    },
  });
  const safeNumber = data.prescriptionNumber.replace(/[^A-Za-z0-9_-]/g, "_");
  return {
    bytes: rendered.bytes,
    filename: `prescription-${safeNumber}.pdf`,
    pageCount: rendered.pageCount,
  };
}

function auditMetadata(
  status: "DRAFT" | "FINALIZED" | "VOID",
  version: number,
  extra: Record<string, string | number | boolean | null | readonly string[]> = {},
) {
  return { status, version, ...extra };
}

async function lockPatient(transaction: Transaction, patientId: string) {
  const [record] = await transaction
    .select({
      id: patient.id,
      patientNumber: patient.patientNumber,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      archivedAt: patient.archivedAt,
    })
    .from(patient)
    .where(eq(patient.id, patientId))
    .limit(1)
    .for("update");
  if (!record) throw new NotFoundError();
  return record;
}

async function resolveSource(
  transaction: Transaction,
  input: { patientId: string } | { consultationId: string },
  doctorId: string,
) {
  if ("consultationId" in input) {
    const [record] = await transaction
      .select({ patientId: consultation.patientId })
      .from(consultation)
      .where(and(eq(consultation.id, input.consultationId), eq(consultation.doctorId, doctorId)))
      .limit(1);
    if (!record) throw new NotFoundError();
    return { patientId: record.patientId, consultationId: input.consultationId } as const;
  }
  return { patientId: input.patientId, consultationId: null } as const;
}

function itemValues(items: readonly PrescriptionItemInput[]) {
  return items.map((item, position) => ({
    position,
    medicationName: item.medicationName,
    dosage: item.dosage ?? null,
    form: item.form ?? null,
    frequency: item.frequency ?? null,
    duration: item.duration ?? null,
    quantity: item.quantity ?? null,
    route: item.route ?? null,
    instructions: item.instructions ?? null,
  }));
}

export async function createPrescriptionDraft(
  input: unknown,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  const parsed = prescriptionCreationInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const source = await resolveSource(transaction, parsed, actor.id);
    const patientRecord = await lockPatient(transaction, source.patientId);
    if (patientRecord.archivedAt) {
      throw new ConflictError("Archived patients cannot receive new prescriptions.");
    }
    const [created] = await transaction
      .insert(prescription)
      .values({
        patientId: patientRecord.id,
        consultationId: source.consultationId,
        doctorId: actor.id,
      })
      .returning({
        id: prescription.id,
        status: prescription.status,
        version: prescription.version,
        prescriptionNumber: prescription.prescriptionNumber,
      });
    if (!created) throw new Error("Prescription insert returned no record.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_DRAFT_CREATED",
      entityType: "prescription",
      entityId: created.id,
      metadata: auditMetadata(created.status, created.version, {
        linkedToConsultation: source.consultationId !== null,
      }),
    });
    return created;
  });
}

export async function savePrescriptionDraft(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  const parsed = prescriptionDraftSaveInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        id: prescription.id,
        patientId: prescription.patientId,
        doctorId: prescription.doctorId,
        status: prescription.status,
        version: prescription.version,
      })
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (current.status !== "DRAFT")
      throw new ConflictError("Only draft prescriptions can be edited.");
    if (current.version !== parsed.expectedVersion) {
      throw new ConflictError("This prescription changed elsewhere. Reload before saving.");
    }

    const patientRecord = await lockPatient(transaction, current.patientId);
    if (patientRecord.archivedAt) throw new ConflictError("Restore this patient before editing.");
    if (parsed.consultationId) {
      const source = await resolveSource(
        transaction,
        { consultationId: parsed.consultationId },
        actor.id,
      );
      if (source.patientId !== current.patientId) {
        throw new ConflictError("The consultation belongs to a different patient.");
      }
    }

    await transaction.delete(prescriptionItem).where(eq(prescriptionItem.prescriptionId, id));
    const values = itemValues(parsed.items);
    if (values.length > 0) {
      await transaction
        .insert(prescriptionItem)
        .values(values.map((value) => ({ ...value, prescriptionId: id })));
    }
    const [updated] = await transaction
      .update(prescription)
      .set({
        consultationId: parsed.consultationId,
        updatedAt: new Date(),
        version: sql`${prescription.version} + 1`,
      })
      .where(
        and(
          eq(prescription.id, id),
          eq(prescription.status, "DRAFT"),
          eq(prescription.version, parsed.expectedVersion),
        ),
      )
      .returning({
        id: prescription.id,
        status: prescription.status,
        version: prescription.version,
        prescriptionNumber: prescription.prescriptionNumber,
      });
    if (!updated) throw new ConflictError("This prescription changed before it was saved.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_DRAFT_UPDATED",
      entityType: "prescription",
      entityId: id,
      metadata: auditMetadata(updated.status, updated.version, {
        itemCount: values.length,
        changedFields: ["consultationId", "items"],
      }),
    });
    return updated;
  });
}

export async function discardPrescriptionDraft(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<void> {
  const { expectedVersion } = prescriptionExpectedVersionSchema.parse(input);
  await db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        doctorId: prescription.doctorId,
        status: prescription.status,
        version: prescription.version,
      })
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (current.status !== "DRAFT")
      throw new ConflictError("Only draft prescriptions can be discarded.");
    if (current.version !== expectedVersion)
      throw new ConflictError("This prescription changed elsewhere. Reload before discarding.");
    await transaction.delete(prescriptionItem).where(eq(prescriptionItem.prescriptionId, id));
    await transaction.delete(prescription).where(eq(prescription.id, id));
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_DRAFT_DISCARDED",
      entityType: "prescription",
      entityId: id,
      metadata: { status: "DRAFT", version: expectedVersion },
    });
  });
}

async function allocatePrescriptionNumber(transaction: Transaction): Promise<string> {
  const [counter] = await transaction
    .select({ nextNumber: prescriptionCounter.nextNumber })
    .from(prescriptionCounter)
    .where(eq(prescriptionCounter.id, 1))
    .limit(1)
    .for("update");
  if (!counter) throw new Error("Prescription numbering is not configured.");
  await transaction
    .update(prescriptionCounter)
    .set({ nextNumber: sql`${prescriptionCounter.nextNumber} + 1` })
    .where(eq(prescriptionCounter.id, 1));
  return `RX-${String(counter.nextNumber).padStart(6, "0")}`;
}

export async function finalizePrescription(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  const { expectedVersion } = prescriptionExpectedVersionSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (current.status !== "DRAFT")
      throw new ConflictError("Only draft prescriptions can be finalized.");
    if (current.version !== expectedVersion)
      throw new ConflictError("This prescription changed elsewhere. Reload before finalizing.");
    const patientRecord = await lockPatient(transaction, current.patientId);
    if (patientRecord.archivedAt)
      throw new ConflictError("Archived patients cannot receive prescriptions.");
    const items = await transaction
      .select({ id: prescriptionItem.id })
      .from(prescriptionItem)
      .where(eq(prescriptionItem.prescriptionId, id));
    if (items.length === 0)
      throw new ConflictError("Add at least one prescription item before finalizing.");
    const [clinic] = await transaction
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.id, 1))
      .limit(1);
    const [doctor] = await transaction
      .select()
      .from(doctorProfessionalProfile)
      .where(eq(doctorProfessionalProfile.userId, actor.id))
      .limit(1);
    if (!clinic?.name || !doctor?.displayName) {
      throw new ConflictError(
        "Complete the clinic and doctor professional profiles before finalizing.",
      );
    }
    const issuedAt = new Date();
    const issueDate = clinicToday(issuedAt);
    const number = await allocatePrescriptionNumber(transaction);
    const [updated] = await transaction
      .update(prescription)
      .set({
        status: "FINALIZED",
        prescriptionNumber: number,
        issuedAt,
        issueDate,
        updatedAt: issuedAt,
        version: sql`${prescription.version} + 1`,
      })
      .where(
        and(
          eq(prescription.id, id),
          eq(prescription.status, "DRAFT"),
          eq(prescription.version, expectedVersion),
        ),
      )
      .returning({
        id: prescription.id,
        status: prescription.status,
        version: prescription.version,
        prescriptionNumber: prescription.prescriptionNumber,
      });
    if (!updated) throw new ConflictError("This prescription changed before finalization.");
    await transaction.insert(prescriptionIssueSnapshot).values({
      prescriptionId: id,
      patientNumber: patientRecord.patientNumber,
      patientName: `${patientRecord.firstName} ${patientRecord.lastName}`,
      patientDateOfBirth: patientRecord.dateOfBirth,
      doctorName: doctor.displayName,
      doctorNameArabic: doctor.displayNameArabic,
      doctorSpecialty: doctor.specialty,
      doctorSpecialtyArabic: doctor.specialtyArabic,
      doctorProfessionalIdentifier: doctor.professionalIdentifier,
      doctorSocialMedia: doctor.socialMedia,
      clinicName: clinic.name,
      clinicNameArabic: clinic.nameArabic,
      clinicAddress: clinic.address,
      clinicAddressArabic: clinic.addressArabic,
      clinicCity: clinic.city,
      clinicCityArabic: clinic.cityArabic,
      clinicPhone: clinic.phone,
      clinicPhoneSecondary: clinic.phoneSecondary,
      clinicEmail: clinic.email,
      clinicLogoDataUrl: clinic.logoDataUrl,
      templateVersion: PRESCRIPTION_TEMPLATE_V3,
    });
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_FINALIZED",
      entityType: "prescription",
      entityId: id,
      metadata: auditMetadata(updated.status, updated.version, {
        itemCount: items.length,
        linkedToConsultation: current.consultationId !== null,
        replacement: current.replacesPrescriptionId !== null,
      }),
    });
    return updated;
  });
}

export async function voidPrescription(
  id: string,
  input: unknown,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  const { expectedVersion } = prescriptionExpectedVersionSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        doctorId: prescription.doctorId,
        status: prescription.status,
        version: prescription.version,
      })
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!current) throw new NotFoundError();
    if (current.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (current.status !== "FINALIZED")
      throw new ConflictError("Only finalized prescriptions can be voided.");
    if (current.version !== expectedVersion)
      throw new ConflictError("This prescription changed elsewhere. Reload before voiding.");
    const now = new Date();
    const [updated] = await transaction
      .update(prescription)
      .set({
        status: "VOID",
        voidedAt: now,
        voidedBy: actor.id,
        updatedAt: now,
        version: sql`${prescription.version} + 1`,
      })
      .where(
        and(
          eq(prescription.id, id),
          eq(prescription.status, "FINALIZED"),
          eq(prescription.version, expectedVersion),
        ),
      )
      .returning({
        id: prescription.id,
        status: prescription.status,
        version: prescription.version,
        prescriptionNumber: prescription.prescriptionNumber,
      });
    if (!updated) throw new ConflictError("This prescription changed before it was voided.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_VOIDED",
      entityType: "prescription",
      entityId: id,
      metadata: auditMetadata(updated.status, updated.version),
    });
    return updated;
  });
}

async function copyAsDraft(
  transaction: Transaction,
  original: { id: string; patientId: string; consultationId: string | null; doctorId: string },
  actor: SafeUser,
  replacesPrescriptionId: string | null,
  copyConsultation: boolean,
) {
  const patientRecord = await lockPatient(transaction, original.patientId);
  if (patientRecord.archivedAt)
    throw new ConflictError("Archived patients cannot receive new prescriptions.");
  const [created] = await transaction
    .insert(prescription)
    .values({
      patientId: original.patientId,
      consultationId: copyConsultation ? original.consultationId : null,
      doctorId: actor.id,
      replacesPrescriptionId,
    })
    .returning({
      id: prescription.id,
      status: prescription.status,
      version: prescription.version,
      prescriptionNumber: prescription.prescriptionNumber,
    });
  if (!created) throw new Error("Prescription draft insert returned no record.");
  const items = await transaction
    .select()
    .from(prescriptionItem)
    .where(eq(prescriptionItem.prescriptionId, original.id))
    .orderBy(prescriptionItem.position);
  if (items.length > 0) {
    await transaction.insert(prescriptionItem).values(
      items.map((item) => ({
        prescriptionId: created.id,
        position: item.position,
        medicationName: item.medicationName,
        dosage: item.dosage,
        form: item.form,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        route: item.route,
        instructions: item.instructions,
      })),
    );
  }
  return { created, itemCount: items.length };
}

export async function duplicatePrescription(
  id: string,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  return db.transaction(async (transaction) => {
    const [original] = await transaction
      .select({
        id: prescription.id,
        patientId: prescription.patientId,
        consultationId: prescription.consultationId,
        doctorId: prescription.doctorId,
        status: prescription.status,
      })
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!original) throw new NotFoundError();
    if (original.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (original.status === "DRAFT")
      throw new ConflictError("Only issued prescriptions can be duplicated.");
    const result = await copyAsDraft(transaction, original, actor, null, false);
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_DUPLICATED",
      entityType: "prescription",
      entityId: result.created.id,
      metadata: { status: "DRAFT", version: result.created.version, itemCount: result.itemCount },
    });
    return result.created;
  });
}

export async function createReplacementPrescription(
  id: string,
  actor: SafeUser,
): Promise<PrescriptionMutationResult> {
  return db.transaction(async (transaction) => {
    const [original] = await transaction
      .select({
        id: prescription.id,
        patientId: prescription.patientId,
        consultationId: prescription.consultationId,
        doctorId: prescription.doctorId,
        status: prescription.status,
      })
      .from(prescription)
      .where(eq(prescription.id, id))
      .limit(1)
      .for("update");
    if (!original) throw new NotFoundError();
    if (original.doctorId !== actor.id) throw new ConflictError("Prescription access denied.");
    if (original.status === "DRAFT")
      throw new ConflictError("Only issued prescriptions can be replaced.");
    const [existing] = await transaction
      .select({ id: prescription.id })
      .from(prescription)
      .where(
        and(
          eq(prescription.replacesPrescriptionId, id),
          inArray(prescription.status, ["FINALIZED", "VOID"]),
        ),
      )
      .limit(1);
    if (existing) throw new ConflictError("This prescription already has an issued replacement.");
    const result = await copyAsDraft(transaction, original, actor, original.id, true);
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRESCRIPTION_REPLACEMENT_DRAFT_CREATED",
      entityType: "prescription",
      entityId: result.created.id,
      metadata: {
        status: "DRAFT",
        version: result.created.version,
        itemCount: result.itemCount,
        replacesPrescription: true,
      },
    });
    return result.created;
  });
}

export async function savePracticeProfile(input: unknown, actor: SafeUser) {
  const parsed = practiceProfileInputSchema.parse(input);
  return db.transaction(async (transaction) => {
    const [existingClinic] = await transaction
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.id, 1))
      .limit(1)
      .for("update");
    if (existingClinic && parsed.clinic.expectedVersion !== existingClinic.version)
      throw new ConflictError("The clinic profile changed elsewhere.");
    if (!existingClinic && parsed.clinic.expectedVersion !== null)
      throw new ConflictError("The clinic profile changed elsewhere.");
    const [existingDoctor] = await transaction
      .select()
      .from(doctorProfessionalProfile)
      .where(eq(doctorProfessionalProfile.userId, actor.id))
      .limit(1)
      .for("update");
    if (existingDoctor && parsed.doctor.expectedVersion !== existingDoctor.version)
      throw new ConflictError("The doctor profile changed elsewhere.");
    if (!existingDoctor && parsed.doctor.expectedVersion !== null)
      throw new ConflictError("The doctor profile changed elsewhere.");
    const clinic = existingClinic
      ? (
          await transaction
            .update(clinicProfile)
            .set({
              name: parsed.clinic.name,
              nameArabic: parsed.clinic.nameArabic ?? null,
              address: parsed.clinic.address ?? null,
              addressArabic: parsed.clinic.addressArabic ?? null,
              city: parsed.clinic.city ?? null,
              cityArabic: parsed.clinic.cityArabic ?? null,
              phone: parsed.clinic.phone ?? null,
              phoneSecondary: parsed.clinic.phoneSecondary ?? null,
              email: parsed.clinic.email ?? null,
              logoDataUrl: parsed.clinic.logoDataUrl ?? null,
              version: sql`${clinicProfile.version} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(clinicProfile.id, 1),
                eq(clinicProfile.version, parsed.clinic.expectedVersion ?? 0),
              ),
            )
            .returning()
        )[0]
      : (
          await transaction
            .insert(clinicProfile)
            .values({
              id: 1,
              name: parsed.clinic.name,
              nameArabic: parsed.clinic.nameArabic ?? null,
              address: parsed.clinic.address ?? null,
              addressArabic: parsed.clinic.addressArabic ?? null,
              city: parsed.clinic.city ?? null,
              cityArabic: parsed.clinic.cityArabic ?? null,
              phone: parsed.clinic.phone ?? null,
              phoneSecondary: parsed.clinic.phoneSecondary ?? null,
              email: parsed.clinic.email ?? null,
              logoDataUrl: parsed.clinic.logoDataUrl ?? null,
            })
            .returning()
        )[0];
    const doctor = existingDoctor
      ? (
          await transaction
            .update(doctorProfessionalProfile)
            .set({
              displayName: parsed.doctor.displayName,
              displayNameArabic: parsed.doctor.displayNameArabic ?? null,
              specialty: parsed.doctor.specialty ?? null,
              specialtyArabic: parsed.doctor.specialtyArabic ?? null,
              professionalIdentifier: parsed.doctor.professionalIdentifier ?? null,
              socialMedia: parsed.doctor.socialMedia ?? null,
              version: sql`${doctorProfessionalProfile.version} + 1`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(doctorProfessionalProfile.userId, actor.id),
                eq(doctorProfessionalProfile.version, parsed.doctor.expectedVersion ?? 0),
              ),
            )
            .returning()
        )[0]
      : (
          await transaction
            .insert(doctorProfessionalProfile)
            .values({
              userId: actor.id,
              displayName: parsed.doctor.displayName,
              displayNameArabic: parsed.doctor.displayNameArabic ?? null,
              specialty: parsed.doctor.specialty ?? null,
              specialtyArabic: parsed.doctor.specialtyArabic ?? null,
              professionalIdentifier: parsed.doctor.professionalIdentifier ?? null,
              socialMedia: parsed.doctor.socialMedia ?? null,
            })
            .returning()
        )[0];
    if (!clinic || !doctor) throw new Error("Practice profile update returned no record.");
    await transaction.insert(auditLog).values({
      actorUserId: actor.id,
      action: "PRACTICE_PROFILE_UPDATED",
      entityType: "practice_profile",
      entityId: actor.id,
      metadata: {
        clinic: true,
        doctor: true,
        clinicVersion: clinic.version,
        doctorVersion: doctor.version,
      },
    });
    return {
      clinic: {
        id: clinic.id,
        name: clinic.name,
        nameArabic: clinic.nameArabic,
        address: clinic.address,
        addressArabic: clinic.addressArabic,
        city: clinic.city,
        cityArabic: clinic.cityArabic,
        phone: clinic.phone,
        phoneSecondary: clinic.phoneSecondary,
        email: clinic.email,
        logoDataUrl: clinic.logoDataUrl,
        version: clinic.version,
      },
      doctor: {
        userId: doctor.userId,
        displayName: doctor.displayName,
        displayNameArabic: doctor.displayNameArabic,
        specialty: doctor.specialty,
        specialtyArabic: doctor.specialtyArabic,
        professionalIdentifier: doctor.professionalIdentifier,
        socialMedia: doctor.socialMedia,
        version: doctor.version,
      },
    } as const;
  });
}
