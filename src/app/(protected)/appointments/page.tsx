import Link from "next/link";

import { AppointmentActions } from "@/components/appointment-actions";
import { requirePageCapability } from "@/modules/auth/page";
import { allowedTransitions } from "@/modules/appointments/lifecycle";
import { listDailyAgenda, listUpcomingAppointments } from "@/modules/appointments/repository";
import {
  clinicDayRange,
  clinicTimezone,
  clinicToday,
  formatClinicDateTime,
  nextCalendarDate,
} from "@/modules/appointments/timezone";
import { agendaQuerySchema } from "@/modules/appointments/validation";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function shiftDate(date: string, days: number): string {
  let result = date;
  const direction = days < 0 ? -1 : 1;
  for (let index = 0; index < Math.abs(days); index += 1) {
    if (direction > 0) result = nextCalendarDate(result);
    else {
      const instant = new Date(`${result}T00:00:00.000Z`);
      instant.setUTCDate(instant.getUTCDate() - 1);
      result = instant.toISOString().slice(0, 10);
    }
  }
  return result;
}

const statusLabels = {
  SCHEDULED: "Scheduled",
  ARRIVED: "Arrived",
  IN_CONSULTATION: "In consultation",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
} as const;

export default async function AppointmentsPage({ searchParams }: Props) {
  const user = await requirePageCapability("appointments.read");
  const raw = await searchParams;
  const parsed = agendaQuerySchema.safeParse({
    date: typeof raw.date === "string" ? raw.date : undefined,
    status: typeof raw.status === "string" ? raw.status : undefined,
  });
  const date = parsed.success && parsed.data.date ? parsed.data.date : clinicToday();
  const status = parsed.success ? parsed.data.status : undefined;
  const agenda = await listDailyAgenda(date, status);
  const upcomingEnd = clinicDayRange(shiftDate(clinicToday(), 7)).start;
  const upcoming = await listUpcomingAppointments(new Date(), upcomingEnd);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">
            Daily agenda
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Appointments
          </h1>
          <p className="mt-2 text-sm text-slate-600">Times shown in {clinicTimezone()}.</p>
        </div>
        <Link
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900"
          href="/appointments/new"
        >
          New appointment
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/appointments?date=${shiftDate(date, -1)}`}
        >
          ← Previous
        </Link>
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/appointments?date=${clinicToday()}`}
        >
          Today
        </Link>
        <form className="flex items-center gap-2" method="get">
          <label className="sr-only" htmlFor="agenda-date">
            Agenda date
          </label>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={date}
            id="agenda-date"
            name="date"
            type="date"
          />
          <label className="sr-only" htmlFor="agenda-status">
            Status
          </label>
          <select
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            defaultValue={status ?? ""}
            id="agenda-status"
            name="status"
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="rounded-md border px-3 py-2 text-sm font-medium" type="submit">
            Go
          </button>
        </form>
        <Link
          className="rounded-md border px-3 py-2 text-sm font-medium"
          href={`/appointments?date=${shiftDate(date, 1)}`}
        >
          Next →
        </Link>
      </div>

      <h2 className="mt-7 text-xl font-semibold text-slate-950">
        {formatClinicDateTime(clinicDayRange(date).start, "EEEE, dd MMMM yyyy")}
      </h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {agenda.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-600">
            No appointments scheduled for this day.
          </p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Administrative reason</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agenda.map((item) => (
                <tr key={item.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    {formatClinicDateTime(new Date(item.scheduledStart), "HH:mm")}–
                    {formatClinicDateTime(new Date(item.scheduledEnd), "HH:mm")}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-slate-950 hover:underline"
                      href={`/patients/${item.patientId}`}
                    >
                      {item.patientDisplayName}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{item.patientNumber}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium">
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                    {item.administrativeReason ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <AppointmentActions
                      allowedTransitions={allowedTransitions(user.role, item.status)}
                      appointmentId={item.id}
                      compact
                      status={item.status}
                      version={item.version}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-950">Upcoming seven days</h2>
        <span className="text-sm text-slate-500">{upcoming.length} active</span>
      </div>
      <ul className="mt-3 divide-y rounded-lg border border-slate-200 bg-white">
        {upcoming.length === 0 ? (
          <li className="p-6 text-sm text-slate-600">No upcoming appointments.</li>
        ) : (
          upcoming.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={item.id}
            >
              <div>
                <Link className="font-medium hover:underline" href={`/appointments/${item.id}`}>
                  {item.patientDisplayName}
                </Link>
                <p className="text-sm text-slate-600">
                  {formatClinicDateTime(new Date(item.scheduledStart))} ·{" "}
                  {statusLabels[item.status]}
                </p>
              </div>
              <span className="font-mono text-xs text-slate-500">{item.patientNumber}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
