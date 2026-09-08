import { PracticeProfileForm } from "@/components/practice-profile-form";
import { requirePageCapability } from "@/modules/auth/page";
import { getPracticeProfile } from "@/modules/prescriptions/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PracticeSettingsPage() {
  const doctor = await requirePageCapability("practice_profile.manage");
  const profile = await getPracticeProfile(doctor.id);
  return (
    <section className="max-w-3xl">
      <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">Settings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        Practice profile
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Configure the clinic and professional identity captured when a prescription is issued. This
        is documentation support, not legal jurisdiction advice.
      </p>
      <PracticeProfileForm initial={profile} />
    </section>
  );
}
