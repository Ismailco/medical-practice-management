import Link from "next/link";

import { PatientList } from "@/components/patient-list";
import { requirePageCapability } from "@/modules/auth/page";
import { searchAdministrativePatients } from "@/modules/patients/repository";
import { PageHeader } from "@/components/ui/page-header";

export default async function PatientsPage() {
  await requirePageCapability("patients.read_administrative");
  const result = await searchAdministrativePatients({ q: "", page: 1, includeArchived: false });

  return (
    <section>
      <PageHeader
        title="Patients"
        description="Administrative patient records. Clinical information is kept in doctor-only workflows."
        actions={
          <Link className="btn btn-primary" href="/patients/new">
            New patient
          </Link>
        }
      />
      <PatientList initial={result} />
    </section>
  );
}
