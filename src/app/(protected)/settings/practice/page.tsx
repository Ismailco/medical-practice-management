import { PracticeProfileForm } from "@/components/practice-profile-form";
import { requirePageCapability } from "@/modules/auth/page";
import { getPracticeProfile } from "@/modules/prescriptions/repository";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PracticeSettingsPage() {
  const doctor = await requirePageCapability("practice_profile.manage");
  const profile = await getPracticeProfile(doctor.id);
  return (
    <section className="form-page">
      <PageHeader
        title="Practice profile"
        description="Configure the clinic and professional identity captured when a prescription is issued. This is documentation support, not legal jurisdiction advice."
      />
      <PracticeProfileForm initial={profile} />
    </section>
  );
}
