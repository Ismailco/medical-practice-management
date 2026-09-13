import { PatientForm } from "@/components/patient-form";
import { requirePageCapability } from "@/modules/auth/page";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewPatientPage() {
  await requirePageCapability("patients.create");

  return (
    <section className="form-page">
      <PageHeader
        backHref="/patients"
        backLabel="Back to patients"
        title="New patient"
        description="Create an administrative record. Optional fields can be completed later."
      />
      <div className="surface form-surface p-6">
        <PatientForm />
      </div>
    </section>
  );
}
