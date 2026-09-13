import Link from "next/link";
import { notFound } from "next/navigation";

import { ClinicalAddendumForm } from "@/components/clinical-addendum-form";
import { ConsultationEditor } from "@/components/consultation-editor";
import { FollowUpCreateForm } from "@/components/follow-up-create-form";
import { PrescriptionCreateButton } from "@/components/prescription-create-button";
import { requirePageCapability } from "@/modules/auth/page";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import type { ClinicalRevisionDto } from "@/modules/consultations/dto";
import { findConsultationDetail } from "@/modules/consultations/repository";
import { consultationIdSchema } from "@/modules/consultations/validation";
import { listConsultationFollowUps } from "@/modules/follow-ups/repository";
import { listConsultationPrescriptions } from "@/modules/prescriptions/repository";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly } from "@/lib/presentation";

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
  const followUps = await listConsultationFollowUps(record.id);
  const prescriptions = await listConsultationPrescriptions(record.id);

  return (
    <section className="clinical-page">
      <PageHeader
        backHref="/consultations"
        backLabel="Back to consultations"
        title={record.patientDisplayName}
        description={`${record.patientNumber} · Started ${formatClinicDateTime(new Date(record.startedAt))} · Dr. ${record.doctorName}`}
        status={<StatusBadge status={record.status} />}
      />
      {record.status === "IN_PROGRESS" ? (
        <div className="clinical-workspace">
          <div className="surface p-6">
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
          <aside className="surface clinical-context p-5">
            <SectionHeader title="Visit context" />
            <dl className="metadata-list mt-4">
              <div>
                <dt>Patient</dt>
                <dd>{record.patientDisplayName}</dd>
              </div>
              <div>
                <dt>Patient number</dt>
                <dd className="font-mono">{record.patientNumber}</dd>
              </div>
              <div>
                <dt>Revision</dt>
                <dd>{record.revisionCount || "Not yet saved"}</dd>
              </div>
              <div>
                <dt>Record status</dt>
                <dd>
                  <StatusBadge status={record.status} />
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-slate-500">
              Clinical documentation stays in the revision history and cannot be edited after
              finalization.
            </p>
          </aside>
        </div>
      ) : (
        <div className="surface mt-4 p-6">
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
          <SectionHeader title="Revision history" />
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
        <section className="surface mt-8 p-6">
          <SectionHeader title="Addenda" />
          <div className="callout callout-warning mt-4">
            <strong>Addenda are permanent.</strong> To correct an addendum, create another addendum.
          </div>
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
      <section className="surface mt-8 p-6">
        <h2 className="text-xl font-semibold">Follow-ups</h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {followUps.length === 0 ? (
            <li className="py-3 text-sm text-slate-600">
              No follow-ups linked to this consultation.
            </li>
          ) : (
            followUps.map((item) => (
              <li className="flex flex-wrap justify-between gap-3 py-3" key={item.id}>
                <Link
                  className="font-medium text-teal-800 hover:underline"
                  href={`/follow-ups/${item.id}`}
                >
                  Due {formatDateOnly(item.dueDate)}
                </Link>
                <StatusBadge status={item.status} />
              </li>
            ))
          )}
        </ul>
        <FollowUpCreateForm consultationId={record.id} />
      </section>
      <section className="surface mt-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Prescriptions</h2>
          <PrescriptionCreateButton consultationId={record.id} />
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {prescriptions.length === 0 ? (
            <li className="py-3 text-sm text-slate-600">
              No prescriptions linked to this consultation.
            </li>
          ) : (
            prescriptions.map((item) => (
              <li className="flex flex-wrap justify-between gap-3 py-3" key={item.id}>
                <Link
                  className="font-medium text-teal-800 hover:underline"
                  href={`/prescriptions/${item.id}`}
                >
                  {item.prescriptionNumber ?? "Draft prescription"}
                </Link>
                <span className="text-sm text-slate-600">
                  {item.status === "DRAFT"
                    ? "Draft"
                    : item.status === "VOID"
                      ? "Void"
                      : "Finalized"}
                  {item.issueDate ? ` · ${formatDateOnly(item.issueDate)}` : ""}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}
