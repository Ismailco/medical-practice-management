import Link from "next/link";
import { notFound } from "next/navigation";

import { ClinicalAddendumForm } from "@/components/clinical-addendum-form";
import { ConsultationEditor } from "@/components/consultation-editor";
import { requirePageCapability } from "@/modules/auth/page";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import type { ClinicalRevisionDto } from "@/modules/consultations/dto";
import { findConsultationDetail } from "@/modules/consultations/repository";
import { consultationIdSchema } from "@/modules/consultations/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ id: string }> };

function ClinicalSnapshot({ revision }: { revision: ClinicalRevisionDto }) {
  const fields = [
    ["Reason for visit", revision.reasonForVisit],
    ["Observations", revision.observations],
    ["Diagnosis", revision.diagnosis],
    ["Clinical notes", revision.notes],
  ] as const;
  return (
    <dl className="space-y-5">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm font-semibold text-slate-700">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-950">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ConsultationPage({ params }: Props) {
  await requirePageCapability("consultations.read");
  const id = consultationIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const record = await findConsultationDetail(id.data);
  if (!record) notFound();
  const current = record.revisions[0];
  const finalRevision = record.revisions.find((revision) => revision.final);

  return (
    <section className="max-w-5xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/consultations">
        ← Back to consultations
      </Link>
      <header className="mt-4 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-sm text-slate-500">{record.patientNumber}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {record.patientDisplayName}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Started {formatClinicDateTime(new Date(record.startedAt))} · Dr. {record.doctorName}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">
            {record.status === "IN_PROGRESS" ? "In progress" : "Finalized"}
          </span>
        </div>
      </header>
      {record.status === "IN_PROGRESS" ? (
        <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Clinical note</h2>
            <p className="mt-1 text-sm text-slate-600">
              Current revision {record.revisionCount || "not yet saved"} · Consultation version{" "}
              {record.version}
            </p>
          </div>
          <ConsultationEditor
            consultationId={record.id}
            {...(current
              ? {
                  current: {
                    reasonForVisit: current.reasonForVisit,
                    observations: current.observations,
                    diagnosis: current.diagnosis,
                    notes: current.notes,
                  },
                }
              : {})}
            revisionNumber={record.revisionCount}
            version={record.version}
          />
        </div>
      ) : (
        <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Finalized clinical record</h2>
            <p className="mt-1 text-sm text-slate-600">
              Finalized{" "}
              {record.finalizedAt ? formatClinicDateTime(new Date(record.finalizedAt)) : "—"} ·
              Revision {finalRevision?.revisionNumber ?? "—"}
            </p>
          </div>
          {finalRevision ? (
            <ClinicalSnapshot revision={finalRevision} />
          ) : (
            <p className="text-sm text-red-700">The finalized revision is unavailable.</p>
          )}
        </div>
      )}
      {record.revisions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Revision history</h2>
          <div className="mt-3 space-y-3">
            {record.revisions.map((revision) => (
              <details
                className="rounded-lg border border-slate-200 bg-white p-4"
                key={revision.id}
              >
                <summary className="cursor-pointer font-medium">
                  Revision {revision.revisionNumber} ·{" "}
                  {formatClinicDateTime(new Date(revision.createdAt))} · {revision.createdByName}
                  {revision.final ? " · Final" : ""}
                </summary>
                <p className="mt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Historical revision — read only
                </p>
                <div className="mt-4">
                  <ClinicalSnapshot revision={revision} />
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
      {record.status === "FINALIZED" ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold">Addenda</h2>
          <div className="mt-4 space-y-4">
            {record.addenda.length === 0 ? (
              <p className="text-sm text-slate-600">No addenda.</p>
            ) : (
              record.addenda.map((addendum) => (
                <article className="border-l-2 border-teal-700 pl-4" key={addendum.id}>
                  <p className="whitespace-pre-wrap text-slate-950">{addendum.content}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatClinicDateTime(new Date(addendum.createdAt))} · {addendum.createdByName}
                  </p>
                </article>
              ))
            )}
          </div>
          <ClinicalAddendumForm consultationId={record.id} />
        </section>
      ) : null}
    </section>
  );
}
