import Link from "next/link";
import { notFound } from "next/navigation";

import { FollowUpActions } from "@/components/follow-up-actions";
import { FollowUpEditor } from "@/components/follow-up-editor";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { requirePageCapability } from "@/modules/auth/page";
import { findFollowUpDetail } from "@/modules/follow-ups/repository";
import { followUpIdSchema } from "@/modules/follow-ups/validation";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateOnly } from "@/lib/presentation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ id: string }> };

export default async function FollowUpPage({ params }: Props) {
  await requirePageCapability("followups.read_sensitive");
  const parsedId = followUpIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();
  const record = await findFollowUpDetail(parsedId.data);
  if (!record) notFound();

  const terminalAt = record.completedAt ?? record.cancelledAt;
  const terminalActor = record.completedByName ?? record.cancelledByName;
  return (
    <section className="detail-page">
      <PageHeader
        backHref="/follow-ups"
        backLabel="Back to follow-ups"
        title={record.patientDisplayName}
        description={`${record.patientNumber} · Due ${formatDateOnly(record.dueDate)}`}
        status={<StatusBadge status={record.status} />}
      />

      <div className="surface mt-4 p-6">
        <SectionHeader title="Sensitive follow-up reason" />
        <p className="mt-2 text-xs text-slate-500">Visible to doctor accounts only.</p>
        <p className="mt-3 whitespace-pre-wrap text-slate-950">{record.reason}</p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <Link
            className="font-medium text-teal-800 hover:underline"
            href={`/patients/${record.patientId}`}
          >
            Open patient
          </Link>
          {record.consultationId ? (
            <Link
              className="font-medium text-teal-800 hover:underline"
              href={`/consultations/${record.consultationId}`}
            >
              Open consultation
            </Link>
          ) : null}
        </div>
      </div>

      {record.status === "PENDING" ? (
        <>
          <div className="surface mt-7 p-6">
            <SectionHeader title="Edit pending follow-up" />
            <div className="mt-4">
              <FollowUpEditor
                id={record.id}
                dueDate={record.dueDate}
                reason={record.reason}
                version={record.version}
              />
            </div>
          </div>
          <div className="surface mt-7 p-6">
            <SectionHeader title="Lifecycle" />
            <div className="mt-4">
              <FollowUpActions id={record.id} version={record.version} />
            </div>
          </div>
        </>
      ) : (
        <p className="mt-6 text-sm text-slate-600">
          {record.status === "COMPLETED" ? "Completed" : "Cancelled"}{" "}
          {terminalAt ? formatClinicDateTime(new Date(terminalAt)) : "—"}
          {terminalActor ? ` by ${terminalActor}` : ""}. This record is frozen.
        </p>
      )}
      <p className="mt-5 text-xs text-slate-500">
        Created by {record.createdByName} · Version {record.version}
      </p>
    </section>
  );
}
