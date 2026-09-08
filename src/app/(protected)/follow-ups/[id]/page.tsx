import Link from "next/link";
import { notFound } from "next/navigation";

import { FollowUpActions } from "@/components/follow-up-actions";
import { FollowUpEditor } from "@/components/follow-up-editor";
import { formatClinicDateTime } from "@/modules/appointments/timezone";
import { requirePageCapability } from "@/modules/auth/page";
import { findFollowUpDetail } from "@/modules/follow-ups/repository";
import { followUpIdSchema } from "@/modules/follow-ups/validation";

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
    <section className="max-w-4xl">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href="/follow-ups">
        ← Back to follow-ups
      </Link>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="font-mono text-sm text-slate-500">{record.patientNumber}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {record.patientDisplayName}
          </h1>
          <p className="mt-2 text-sm text-slate-600">Due {record.dueDate}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold">
          {record.status}
        </span>
      </header>

      <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Sensitive follow-up reason</h2>
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
          <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Edit pending follow-up</h2>
            <div className="mt-4">
              <FollowUpEditor
                id={record.id}
                dueDate={record.dueDate}
                reason={record.reason}
                version={record.version}
              />
            </div>
          </div>
          <div className="mt-7 rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Lifecycle</h2>
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
