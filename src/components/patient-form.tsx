"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  readCreatedPatientId,
  readPatientError,
  type PatientFieldErrors,
} from "@/modules/patients/client-response";
import { Button } from "@/components/ui/button";

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
    <p className="field-error" id={`${field}-error`}>
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
  const errorEntries = Object.entries(fieldErrors);

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
        setMessage(Object.keys(error.fieldErrors).length > 0 ? null : error.message);
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
      {errorEntries.length > 0 ? (
        <div className="error-summary" role="alert">
          <h2>Please correct the highlighted fields.</h2>
          <ul>
            {errorEntries.map(([field, error]) => (
              <li key={field}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset className="grid gap-5 sm:grid-cols-2" disabled={pending}>
        <legend className="form-section-title">Identity and contact</legend>
        {fields.map((field, index) => (
          <div key={field.name}>
            <label className="block text-sm font-medium text-slate-800" htmlFor={field.name}>
              {field.label}
            </label>
            <input
              aria-describedby={fieldErrors[field.name] ? `${field.name}-error` : undefined}
              aria-invalid={fieldErrors[field.name] ? true : undefined}
              autoFocus={!editing && index === 0}
              className="field-control mt-1.5"
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
            aria-describedby={`dateOfBirth-help${fieldErrors.dateOfBirth ? " dateOfBirth-error" : ""}`}
            aria-invalid={fieldErrors.dateOfBirth ? true : undefined}
            className="field-control mt-1.5"
            defaultValue={initial?.dateOfBirth ?? ""}
            id="dateOfBirth"
            lang="en-GB"
            name="dateOfBirth"
            required
            type="date"
          />
          <p className="field-help" id="dateOfBirth-help">
            Day / month / year
          </p>
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
            className="field-control mt-1.5"
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
            className="field-control mt-1.5"
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
            className="field-control mt-1.5 min-h-24"
            defaultValue={initial?.address ?? ""}
            id="address"
            maxLength={500}
            name="address"
          />
          <FieldError errors={fieldErrors} field="address" />
        </div>
      </fieldset>

      <fieldset
        className="form-section grid gap-5 border-t border-slate-200 pt-6 sm:grid-cols-2"
        disabled={pending}
      >
        <legend className="form-section-title mb-4">
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
            className="field-control mt-1.5"
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
            className="field-control mt-1.5"
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
        <p aria-live="polite" className="error-summary" role="alert">
          {message}
        </p>
      ) : null}

      <div className="sticky-actions">
        <Button disabled={pending} onClick={() => router.back()} type="button">
          Cancel
        </Button>
        <Button disabled={pending} type="submit" variant="primary">
          {pending ? "Saving…" : editing ? "Save changes" : "Create patient"}
        </Button>
      </div>
    </form>
  );
}
