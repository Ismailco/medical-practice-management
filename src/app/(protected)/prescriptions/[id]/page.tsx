import Link from "next/link";
import { notFound } from "next/navigation";

import { PrescriptionActions } from "@/components/prescription-actions";
import { PrescriptionDraftEditor } from "@/components/prescription-draft-editor";
import { PrescriptionPdfButton } from "@/components/prescription-pdf-button";
import { requirePageCapability } from "@/modules/auth/page";
import { findPrescriptionDetail } from "@/modules/prescriptions/repository";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PrescriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageCapability("prescriptions.read");
  const parsed = prescriptionIdSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const record = await findPrescriptionDetail(parsed.data);
  if (!record) notFound();
  const snapshot = record.snapshot;
  return (
    <section className="detail-page">
      <PageHeader
        backHref="/prescriptions"
        backLabel="Back to prescriptions"
        title={record.prescriptionNumber ?? "Draft prescription"}
        description={`${record.patientDisplayName} · ${record.patientNumber}${record.issueDate ? ` · Issued ${formatDateOnly(record.issueDate)}` : ""}`}
        status={<StatusBadge status={record.status} />}
      />
      {record.status === "DRAFT" ? (
        <PrescriptionDraftEditor
          id={record.id}
          version={record.version}
          consultationId={record.consultationId}
          initialItems={record.items}
        />
      ) : (
        <>
          <section className="surface mt-4 p-6">
            <SectionHeader
              title="Issued identity snapshot"
              description="These values are preserved as they were when the prescription was issued."
            />
            <p className="mt-1 text-sm text-slate-600">
              Historical issue snapshot · Version {record.version}
            </p>
            {snapshot ? (
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Patient at issue</dt>
                  <dd className="mt-1">
                    {snapshot.patientName} · {snapshot.patientNumber} ·{" "}
                    {formatDateOnly(snapshot.patientDateOfBirth)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Doctor at issue</dt>
                  <dd className="mt-1">
                    {snapshot.doctorName}
                    {snapshot.doctorSpecialty ? ` · ${snapshot.doctorSpecialty}` : ""}
                    {snapshot.doctorProfessionalIdentifier
                      ? ` · ${snapshot.doctorProfessionalIdentifier}`
                      : ""}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-500">Clinic at issue</dt>
                  <dd className="mt-1">
                    {snapshot.clinicName}
                    {snapshot.clinicAddress ? ` · ${snapshot.clinicAddress}` : ""}
                    {snapshot.clinicPhone ? ` · ${snapshot.clinicPhone}` : ""}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-red-700">Issue snapshot unavailable.</p>
            )}
          </section>
          <ItemList items={record.items} />
          <div className="mt-6">
            <PrescriptionPdfButton prescriptionId={record.id} voided={record.status === "VOID"} />
          </div>
        </>
      )}
      {record.replacesPrescriptionId ? (
        <p className="mt-6 text-sm text-slate-600">
          Replacement of{" "}
          <Link
            className="text-teal-800 hover:underline"
            href={`/prescriptions/${record.replacesPrescriptionId}`}
          >
            a previous prescription
          </Link>
          .
        </p>
      ) : null}
      {record.replacedBy.length > 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          Replaced by:{" "}
          {record.replacedBy.map((item) => (
            <Link
              className="ml-2 text-teal-800 hover:underline"
              href={`/prescriptions/${item.id}`}
              key={item.id}
            >
              {item.prescriptionNumber ?? "Draft"}
            </Link>
          ))}
        </p>
      ) : null}
      {record.status !== "DRAFT" ? (
        <section className="mt-7">
          <PrescriptionActions
            id={record.id}
            status={record.status}
            version={record.version}
            prescriptionNumber={record.prescriptionNumber}
          />
        </section>
      ) : null}
    </section>
  );
}

function ItemList({
  items,
}: Readonly<{
  items: readonly {
    id: string;
    position: number;
    medicationName: string;
    dosage: string | null;
    form: string | null;
    frequency: string | null;
    duration: string | null;
    quantity: string | null;
    route: string | null;
    instructions: string | null;
  }[];
}>) {
  return (
    <section className="surface mt-7 p-6">
      <SectionHeader title="Medication items" />
      <ol className="mt-4 space-y-4">
        {items.map((item) => (
          <li className="border-b border-slate-100 pb-4 last:border-0" key={item.id}>
            <p className="font-medium">
              {item.position + 1}. {item.medicationName}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {[item.dosage, item.form, item.frequency, item.duration, item.quantity, item.route]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {item.instructions ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.instructions}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
