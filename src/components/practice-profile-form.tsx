"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState, type ChangeEvent, type FormEvent } from "react";

type Profile = {
  clinic: {
    name: string;
    nameArabic: string | null;
    address: string | null;
    addressArabic: string | null;
    city: string | null;
    cityArabic: string | null;
    phone: string | null;
    phoneSecondary: string | null;
    email: string | null;
    logoDataUrl: string | null;
    version: number;
  };
  doctor: {
    displayName: string;
    displayNameArabic: string | null;
    specialty: string | null;
    specialtyArabic: string | null;
    professionalIdentifier: string | null;
    socialMedia: string | null;
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
          nameArabic: profile.clinic.nameArabic,
          address: profile.clinic.address,
          addressArabic: profile.clinic.addressArabic,
          city: profile.clinic.city,
          cityArabic: profile.clinic.cityArabic,
          phone: profile.clinic.phone,
          phoneSecondary: profile.clinic.phoneSecondary,
          email: profile.clinic.email,
          logoDataUrl: profile.clinic.logoDataUrl,
          expectedVersion: profile.clinic.version || null,
        },
        doctor: {
          displayName: profile.doctor.displayName,
          displayNameArabic: profile.doctor.displayNameArabic,
          specialty: profile.doctor.specialty,
          specialtyArabic: profile.doctor.specialtyArabic,
          professionalIdentifier: profile.doctor.professionalIdentifier,
          socialMedia: profile.doctor.socialMedia,
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

  function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Logo must be a PNG or JPEG image.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("Logo must be smaller than 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        setError("The logo could not be read.");
        return;
      }
      const logoDataUrl = reader.result;
      setProfile((current) => ({
        ...current,
        clinic: { ...current.clinic, logoDataUrl },
      }));
      setError(null);
    });
    reader.addEventListener("error", () => setError("The logo could not be read."));
    reader.readAsDataURL(file);
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
          <label className="text-sm" dir="rtl">
            <span className="font-medium">اسم العيادة</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.nameArabic ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  clinic: { ...p.clinic, nameArabic: e.target.value },
                }))
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
          <label className="text-sm">
            <span className="font-medium">Landline</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.phoneSecondary ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  clinic: { ...p.clinic, phoneSecondary: e.target.value },
                }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Email</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              type="email"
              value={profile.clinic.email ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, clinic: { ...p.clinic, email: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">City</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.city ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, clinic: { ...p.clinic, city: e.target.value } }))
              }
            />
          </label>
          <label className="text-sm" dir="rtl">
            <span className="font-medium">المدينة</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.cityArabic ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  clinic: { ...p.clinic, cityArabic: e.target.value },
                }))
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
          <label className="text-sm sm:col-span-2" dir="rtl">
            <span className="font-medium">العنوان</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.clinic.addressArabic ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  clinic: { ...p.clinic, addressArabic: e.target.value },
                }))
              }
            />
          </label>
          <div className="text-sm sm:col-span-2">
            <span className="font-medium">Clinic logo</span>
            <input
              accept="image/png,image/jpeg"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"
              onChange={handleLogoChange}
              type="file"
            />
            <p className="mt-1 text-xs text-slate-500">PNG or JPEG, up to 1 MB.</p>
            {profile.clinic.logoDataUrl ? (
              <div className="mt-3 flex items-center gap-3">
                <Image
                  alt="Clinic logo preview"
                  className="h-20 w-20 rounded border border-slate-200 object-contain p-1"
                  height={80}
                  unoptimized
                  src={profile.clinic.logoDataUrl}
                  width={80}
                />
                <button
                  className="text-sm font-medium text-red-700 hover:underline"
                  onClick={() =>
                    setProfile((p) => ({ ...p, clinic: { ...p.clinic, logoDataUrl: null } }))
                  }
                  type="button"
                >
                  Remove logo
                </button>
              </div>
            ) : null}
          </div>
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
          <label className="text-sm" dir="rtl">
            <span className="font-medium">اسم الطبيب</span>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              value={profile.doctor.displayNameArabic ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  doctor: { ...p.doctor, displayNameArabic: e.target.value },
                }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">Specialty</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              rows={3}
              value={profile.doctor.specialty ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, doctor: { ...p.doctor, specialty: e.target.value } }))
              }
            />
            <span className="mt-1 block text-xs text-slate-500">
              Enter one specialization per line.
            </span>
          </label>
          <label className="text-sm" dir="rtl">
            <span className="font-medium">التخصص</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              rows={3}
              value={profile.doctor.specialtyArabic ?? ""}
              onChange={(e) =>
                setProfile((p) => ({
                  ...p,
                  doctor: { ...p.doctor, specialtyArabic: e.target.value },
                }))
              }
            />
            <span className="mt-1 block text-xs text-slate-500" dir="ltr">
              Enter one specialization per line.
            </span>
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
          <label className="text-sm sm:col-span-2">
            <span className="font-medium">Social media</span>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="Instagram: @doctor or https://..."
              rows={2}
              value={profile.doctor.socialMedia ?? ""}
              onChange={(e) =>
                setProfile((p) => ({ ...p, doctor: { ...p.doctor, socialMedia: e.target.value } }))
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
