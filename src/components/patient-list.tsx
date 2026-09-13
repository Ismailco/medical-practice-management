"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { readPatientError } from "@/modules/patients/client-response";
import type { PatientSearchResult } from "@/modules/patients/repository";
import { formatDateOnly } from "@/lib/presentation";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

function isPatientSearchResult(value: unknown): value is PatientSearchResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray(value.items) &&
    "page" in value &&
    typeof value.page === "number" &&
    "pageSize" in value &&
    typeof value.pageSize === "number" &&
    "total" in value &&
    typeof value.total === "number" &&
    "totalPages" in value &&
    typeof value.totalPages === "number"
  );
}

export function PatientList({ initial }: { initial: PatientSearchResult }) {
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(page: number) {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/patients/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, page, includeArchived }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readPatientError(body).message);
        return;
      }
      if (!isPatientSearchResult(body)) {
        setError("The search response could not be read.");
        return;
      }
      setResult(body);
    } catch {
      setError("Unable to search patients. Please try again.");
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1);
  }

  return (
    <>
      <form className="surface mt-6 flex flex-wrap items-end gap-3 p-4" onSubmit={submit}>
        <div className="min-w-64 flex-1">
          <label className="block text-sm font-medium text-slate-800" htmlFor="patient-search">
            Search patients
          </label>
          <input
            className="field-control mt-1.5"
            id="patient-search"
            maxLength={100}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Patient number, name, phone, or email"
            type="search"
            value={query}
          />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
          <input
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            type="checkbox"
          />
          Include archived
        </label>
        <button className="btn btn-secondary" disabled={pending} type="submit">
          {pending ? "Searching…" : "Search"}
        </button>
      </form>

      {error ? (
        <p aria-live="polite" className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="surface mt-4 overflow-hidden">
        {result.items.length === 0 ? (
          <EmptyState
            title={query ? "No matching patients" : "No patients yet"}
            description={
              query
                ? "Try another identifier or include archived records."
                : "Create the first administrative patient record to begin."
            }
          />
        ) : (
          <>
            <div className="patient-table overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs tracking-wide text-slate-600 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Patient number
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Name
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Date of birth
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Phone
                    </th>
                    <th className="px-4 py-3 font-medium" scope="col">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {result.items.map((patient) => (
                    <tr className="hover:bg-slate-50" key={patient.id}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        <Link
                          className="font-semibold text-teal-800 hover:underline"
                          href={`/patients/${patient.id}`}
                        >
                          {patient.patientNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-950">
                        <Link className="hover:underline" href={`/patients/${patient.id}`}>
                          {patient.firstName} {patient.lastName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateOnly(patient.dateOfBirth)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{patient.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={patient.archived ? "ARCHIVED" : "ACTIVE"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="patient-cards">
              {result.items.map((patient) => (
                <Link className="patient-card" href={`/patients/${patient.id}`} key={patient.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-slate-950">
                      {patient.firstName} {patient.lastName}
                    </div>
                    <StatusBadge status={patient.archived ? "ARCHIVED" : "ACTIVE"} />
                  </div>
                  <div className="patient-card-number">{patient.patientNumber}</div>
                  <div className="patient-card-meta">
                    <span>DOB {formatDateOnly(patient.dateOfBirth)}</span>
                    <span>{patient.phone ?? "No phone"}</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-sm text-slate-600">
        <p>
          {result.total} {result.total === 1 ? "patient" : "patients"} · Page {result.page} of{" "}
          {result.totalPages}
        </p>
        <nav aria-label="Patient list pagination" className="flex gap-2">
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-white disabled:opacity-40"
            disabled={pending || result.page <= 1}
            onClick={() => void load(result.page - 1)}
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-white disabled:opacity-40"
            disabled={pending || result.page >= result.totalPages}
            onClick={() => void load(result.page + 1)}
            type="button"
          >
            Next
          </button>
        </nav>
      </div>
    </>
  );
}
