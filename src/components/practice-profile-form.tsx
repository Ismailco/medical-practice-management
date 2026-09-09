"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Profile = {
  clinic: { name: string; address: string | null; phone: string | null; version: number };
  doctor: {
    displayName: string;
    specialty: string | null;
    professionalIdentifier: string | null;
    version: number;
  };
};

export function PracticeProfileForm({ initial }: Readonly<{ initial: Profile }>) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const response = await fetch("/api/settings/practice", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clinic: {
          name: profile.clinic.name,
          address: profile.clinic.address,
          phone: profile.clinic.phone,
          expectedVersion: profile.clinic.version || null,
        },
        doctor: {
          displayName: profile.doctor.displayName,
          specialty: profile.doctor.specialty,
          professionalIdentifier: profile.doctor.professionalIdentifier,
          expectedVersion: profile.doctor.version || null,
        },
      }),
    });
    const result = (await response.json()) as {
      error?: string;
      clinic?: Profile["clinic"];
      doctor?: Profile["doctor"];
    };
    if (!response.ok || !result.clinic || !result.doctor) {
      setError(result.error ?? "The practice profile could not be saved.");
      return;
    }
    setProfile({ clinic: result.clinic, doctor: result.doctor });
    setSaved(true);
    router.refresh();
  }

  return (
    <form className="mt-6 space-y-8" onSubmit={save}>
      <fieldset className="rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-2 text-lg font-semibold">Clinic profile</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Clinic name</span>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.name}
              onChange={(e) =>
                setProfile((p) => ({ ...p, clinic: { ...p.clinic, name: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Phone</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.phone ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, clinic: { ...p.clinic, phone: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">Address</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.address ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, clinic: { ...p.clinic, address: e.target.value } }))
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-slate-200 bg-white p-6">
        <legend className="px-2 text-lg font-semibold">Doctor professional profile</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Display name</span>
            <input
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.doctor.displayName}
              onChange={(e) =>
                setProfile((p) => ({ ...p, doctor: { ...p.doctor, displayName: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Specialty</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.doctor.specialty ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, doctor: { ...p.doctor, specialty: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">Professional identifier</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.doctor.professionalIdentifier ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  doctor: { ...p.doctor, professionalIdentifier: e.target.value },
                }))
              }
            />
          </label>
        </div>
      </fieldset>
      <p className="text-xs text-slate-500">
        Jurisdiction-specific prescription identifiers and legal formatting are not determined by
        this application.
      </p>
      <div className="flex items-center gap-3">
        <button
          className="rounded-md bg-teal-800 px-4 py-2 text-sm font-semibold text-white"
          type="submit"
        >
          Save practice profile
        </button>
        {saved ? <span className="text-sm text-teal-800">Saved.</span> : null}
        {error ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}
