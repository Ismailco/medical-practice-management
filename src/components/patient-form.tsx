"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  readCreatedPatientId,
  readPatientError,
  type PatientFieldErrors,
} from "@/modules/patients/client-response";

type PatientFormValues = Readonly<{
  id?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  version?: number;
}>;

type Props = Readonly<{
  initial?: PatientFormValues;
}>;

const fields = [
  { name: "firstName", label: "First name", required: true, maxLength: 100 },
  { name: "lastName", label: "Last name", required: true, maxLength: 100 },
] as const;

function FieldError({ field, errors }: { field: string; errors: PatientFieldErrors }) {
  const error = errors[field];
  return error ? (
    <p className="mt-1 text-sm text-red-700" id={`${field}-error`}>
      {error}
    </p>
  ) : null;
}

export function PatientForm({ initial }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PatientFieldErrors>({});
  const editing = initial?.id !== undefined;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const body = {
      firstName: data.get("firstName"),
      lastName: data.get("lastName"),
      dateOfBirth: data.get("dateOfBirth"),
      phone: data.get("phone"),
      email: data.get("email"),
      address: data.get("address"),
      emergencyContactName: data.get("emergencyContactName"),
      emergencyContactPhone: data.get("emergencyContactPhone"),
      ...(editing ? { expectedVersion: initial.version } : {}),
    };

    try {
      const response = await fetch(editing ? `/api/patients/${initial.id}` : "/api/patients", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error = readPatientError(result);
        setMessage(error.message);
        setFieldErrors(error.fieldErrors);
        return;
      }

      const patientId = readCreatedPatientId(result);
      if (!patientId) {
        setMessage("The patient was saved, but the response could not be read.");
        return;
      }

      router.push(`/patients/${patientId}`);
      router.refresh();
    } catch {
      setMessage("Unable to save the patient. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-7" noValidate onSubmit={submit}>
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={pending}>
        <legend className="sr-only">Patient identity</legend>
        {fields.map((field, index) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-slate-800" htmlFor={field.name}>
              {field.label}
            </label>
            <input
              aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined}
              aria-invalid={fieldErrors[field.name] ? true : undefined}
              autoFocus={!editing && index === 0}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
              defaultValue={initial?.[field.name] ?? ""}
              id={field.name}
              maxLength={field.maxLength}
              name={field.name}
              required={field.required}
            />
            <FieldError errors={fieldErrors} field={field.name} />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="dateOfBirth">
            Date of birth
          </label>
          <input
            aria-describedby={fieldErrors.dateOfBirth ? "dateOfBirth-error" : undefined}
            aria-invalid={fieldErrors.dateOfBirth ? true : undefined}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.dateOfBirth ?? ""}
            id="dateOfBirth"
            name="dateOfBirth"
            required
            type="date"
          />
          <FieldError errors={fieldErrors} field="dateOfBirth" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="phone">
            Phone <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
            aria-invalid={fieldErrors.phone ? true : undefined}
            autoComplete="tel"
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.phone ?? ""}
            id="phone"
            inputMode="tel"
            maxLength={32}
            name="phone"
          />
          <FieldError errors={fieldErrors} field="phone" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800" htmlFor="email">
            Email <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            aria-invalid={fieldErrors.email ? true : undefined}
            autoComplete="email"
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.email ?? ""}
            id="email"
            maxLength={254}
            name="email"
            type="email"
          />
          <FieldError errors={fieldErrors} field="email" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-slate-800" htmlFor="address">
            Address <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            aria-describedby={fieldErrors.address ? "address-error" : undefined}
            aria-invalid={fieldErrors.address ? true : undefined}
            className="mt-1.5 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.address ?? ""}
            id="address"
            maxLength={500}
            name="address"
          />
          <FieldError errors={fieldErrors} field="address" />
        </div>
      </fieldset>

      <fieldset
        className="grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-2"
        disabled={pending}
      >
        <legend className="mb-4 text-base font-semibold text-slate-950">
          Emergency contact <span className="font-normal text-slate-500">(optional)</span>
        </legend>
        <div>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="emergencyContactName"
          >
            Contact name
          </label>
          <input
            aria-describedby={
              fieldErrors.emergencyContactName ? "emergencyContactName-error" : undefined
            }
            aria-invalid={fieldErrors.emergencyContactName ? true : undefined}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.emergencyContactName ?? ""}
            id="emergencyContactName"
            maxLength={100}
            name="emergencyContactName"
          />
          <FieldError errors={fieldErrors} field="emergencyContactName" />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-slate-800"
            htmlFor="emergencyContactPhone"
          >
            Contact phone
          </label>
          <input
            aria-describedby={
              fieldErrors.emergencyContactPhone ? "emergencyContactPhone-error" : undefined
            }
            aria-invalid={fieldErrors.emergencyContactPhone ? true : undefined}
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
            defaultValue={initial?.emergencyContactPhone ?? ""}
            id="emergencyContactPhone"
            inputMode="tel"
            maxLength={32}
            name="emergencyContactPhone"
          />
          <FieldError errors={fieldErrors} field="emergencyContactPhone" />
        </div>
      </fieldset>

      {message ? (
        <p
          aria-live="polite"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {message}
        </p>
      ) : null}

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
        <button
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          disabled={pending}
          onClick={() => router.back()}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Create patient"}
        </button>
      </div>
    </form>
  );
}
