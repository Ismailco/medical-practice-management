import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { clinicalJson, consultationRouteError } from "@/modules/consultations/http";
import { listConsultations } from "@/modules/consultations/repository";
import { startDirectConsultation } from "@/modules/consultations/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("consultations.read", request.headers);
    return clinicalJson({ consultations: await listConsultations() });
  } catch (error) {
    return consultationRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("consultations.write", request.headers);
    const result = await startDirectConsultation(await request.json().catch(() => null), actor);
    return clinicalJson({ consultation: result }, { status: 201 });
  } catch (error) {
    return consultationRouteError(error);
  }
}
