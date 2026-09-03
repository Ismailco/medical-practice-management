import { z } from "zod";

import { noStoreJson, requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { appointmentRouteError } from "@/modules/appointments/http";
import { searchActivePatientIdentities } from "@/modules/appointments/repository";

const inputSchema = z.object({ q: z.string().trim().min(2).max(100) }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    await requireCapability("appointments.create", request.headers);
    const input = inputSchema.parse(await request.json().catch(() => null));
    const patients = (await searchActivePatientIdentities(input.q)).map((patient) => ({
      id: patient.id,
      patientNumber: patient.patientNumber,
      displayName: `${patient.firstName} ${patient.lastName}`,
    }));
    return noStoreJson({ patients });
  } catch (error) {
    return appointmentRouteError(error);
  }
}
