import Link from "next/link";
import { notFound } from "next/navigation";

import { PrescriptionActions } from "@/components/prescription-actions";
import { PrescriptionDraftEditor } from "@/components/prescription-draft-editor";
import { requirePageCapability } from "@/modules/auth/page";
import { findPrescriptionDetail } from "@/modules/prescriptions/repository";
import { prescriptionIdSchema } from "@/modules/prescriptions/validation";

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
    <section className="max-w-5xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/prescriptions">
        ← Back to prescriptions
      </Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-sm text-slate-500">{record.patientNumber}</p>
          <h1 className="mt-1 text-3xl font-semibold">
            {record.prescriptionNumber ?? "Draft prescription"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {record.patientDisplayName} · {record.status}
            {record.issueDate ? ` · Issued ${record.issueDate}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${record.status === "VOID" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}
        >
          {record.status}
        </span>
      </header>
      {record.status === "DRAFT" ? (
        <PrescriptionDraftEditor
          id={record.id}
          version={record.version}
          consultationId={record.consultationId}
          initialItems={record.items}
        />
      ) : (
        <>
          <section className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold">Issued prescription</h2>
            <p className="mt-1 text-sm text-slate-600">
              Historical issue snapshot · Version {record.version}
            </p>
            {snapshot ? (
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Patient at issue</dt>
                  <dd className="mt-1">
                    {snapshot.patientName} · {snapshot.patientNumber} ·{" "}
                    {snapshot.patientDateOfBirth}
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
      <section className="mt-7">
        <PrescriptionActions
          id={record.id}
          status={record.status}
          version={record.version}
          prescriptionNumber={record.prescriptionNumber}
        />
      </section>
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
    <section className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Medication items</h2>
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
