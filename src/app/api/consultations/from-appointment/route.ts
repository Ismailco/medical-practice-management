import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { clinicalJson, consultationRouteError } from "@/modules/consultations/http";
import { startConsultationFromAppointment } from "@/modules/consultations/service";

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("consultations.write", request.headers);
    const result = await startConsultationFromAppointment(
      await request.json().catch(() => null),
      actor,
    );
    return clinicalJson({ consultation: result }, { status: 201 });
  } catch (error) {
    return consultationRouteError(error);
  }
}
