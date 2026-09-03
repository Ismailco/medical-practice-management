"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type PatientOption = Readonly<{
  id: string;
  patientNumber: string;
  displayName: string;
}>;

type InitialAppointment = Readonly<{
  id: string;
  patient: PatientOption;
  localDate: string;
  localStartTime: string;
  durationMinutes: number;
  administrativeReason: string | null;
  version: number;
}>;

type Props = Readonly<{
  defaultDate?: string;
  initialPatient?: PatientOption;
  initial?: InitialAppointment;
}>;

function isPatientOption(value: unknown): value is PatientOption {
  if (!value || typeof value !== "object") return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "patientNumber" in value &&
    typeof value.patientNumber === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string"
  );
}

function readFieldErrors(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || !("fieldErrors" in value)) return {};
  return Object.fromEntries(
    Object.entries(value.fieldErrors ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function AppointmentForm({ defaultDate, initialPatient, initial }: Props) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientOption | null>(
    initial?.patient ?? initialPatient ?? null,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly PatientOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const editing = initial !== undefined;

  useEffect(() => {
    if (patient || query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch("/api/appointments/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query }),
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (
          response.ok &&
          body &&
          typeof body === "object" &&
          "patients" in body &&
          Array.isArray(body.patients)
        ) {
          setResults(body.patients.filter(isPatientOption));
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [patient, query]);

  async function save(body: Record<string, unknown>, allowOverlap: boolean): Promise<Response> {
    return fetch(editing ? `/api/appointments/${initial.id}` : "/api/appointments", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, allowOverlap }),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!patient) {
      setMessage("Select a patient.");
      return;
    }
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const body = {
      ...(!editing ? { patientId: patient.id } : {}),
      localDate: form.get("localDate"),
      localStartTime: form.get("localStartTime"),
      durationMinutes: Number(form.get("durationMinutes")),
      administrativeReason: form.get("administrativeReason"),
      ...(editing ? { expectedVersion: initial.version } : {}),
    };

    try {
      let response = await save(body, false);
      let result: unknown = await response.json().catch(() => null);
      if (
        response.status === 409 &&
        result !== null &&
        typeof result === "object" &&
        "code" in result &&
        result.code === "APPOINTMENT_OVERLAP" &&
        window.confirm("This time overlaps another active appointment. Schedule it anyway?")
      ) {
        response = await save(body, true);
        result = await response.json().catch(() => null);
      }
      if (!response.ok) {
        const error =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Unable to save the appointment.";
        setMessage(error);
        setFieldErrors(readFieldErrors(result));
        return;
      }
      const id =
        result &&
        typeof result === "object" &&
        "appointment" in result &&
        result.appointment &&
        typeof result.appointment === "object" &&
        "id" in result.appointment &&
        typeof result.appointment.id === "string"
          ? result.appointment.id
          : null;
      if (!id) {
        setMessage("The appointment was saved, but the response could not be read.");
        return;
      }
      router.push(`/appointments/${id}`);
      router.refresh();
    } catch {
      setMessage("Unable to save the appointment. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100";
  return (
    <form className="space-y-6" noValidate onSubmit={submit}>
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={pending}>
        <legend className="sr-only">Appointment details</legend>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-800" htmlFor="patientSearch">
            Patient
          </label>
          {patient ? (
            <div className="mt-1.5 flex items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
              <span>
                <span className="font-medium">{patient.displayName}</span>{" "}
                <span className="font-mono text-sm text-slate-600">{patient.patientNumber}</span>
              </span>
              {!editing ? (
                <button
                  className="text-sm font-medium text-teal-800 hover:underline"
                  onClick={() => setPatient(null)}
                  type="button"
                >
                  Change
                </button>
              ) : null}
            </div>
          ) : (
            <div className="relative">
              <input
                autoFocus
                className={inputClass}
                id="patientSearch"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by patient name or number"
                value={query}
              />
              {searching ? <p className="mt-2 text-sm text-slate-500">Searching…</p> : null}
              {query.trim().length >= 2 && results.length > 0 ? (
                <ul
                  className="mt-2 divide-y rounded-md border border-slate-200 bg-white"
                  aria-label="Patient search results"
                >
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => {
                          setPatient(item);
                          setQuery("");
                        }}
                        type="button"
                      >
                        <span className="font-medium">{item.displayName}</span>{" "}
                        <span className="font-mono text-sm text-slate-600">
                          {item.patientNumber}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="localDate">
            Date
          </label>
          <input
            className={inputClass}
            defaultValue={initial?.localDate ?? defaultDate}
            id="localDate"
            name="localDate"
            required
            type="date"
          />
          {fieldErrors.localDate ? (
            <p className="mt-1 text-sm text-red-700">{fieldErrors.localDate}</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="localStartTime">
            Start time
          </label>
          <input
            className={inputClass}
            defaultValue={initial?.localStartTime ?? "09:00"}
            id="localStartTime"
            name="localStartTime"
            required
            type="time"
          />
          {fieldErrors.localStartTime ? (
            <p className="mt-1 text-sm text-red-700">{fieldErrors.localStartTime}</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="durationMinutes">
            Duration
          </label>
          <select
            className={inputClass}
            defaultValue={initial?.durationMinutes ?? 30}
            id="durationMinutes"
            name="durationMinutes"
          >
            {[15, 30, 45, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="administrativeReason"
          >
            Administrative reason <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            className={inputClass}
            defaultValue={initial?.administrativeReason ?? ""}
            id="administrativeReason"
            maxLength={160}
            name="administrativeReason"
          />
          <p className="mt-1 text-xs text-slate-500">
            Keep this brief and administrative. Do not enter clinical details.
          </p>
          {fieldErrors.administrativeReason ? (
            <p className="mt-1 text-sm text-red-700">{fieldErrors.administrativeReason}</p>
          ) : null}
        </div>
      </fieldset>
      {message ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Schedule appointment"}
        </button>
      </div>
    </form>
  );
}
