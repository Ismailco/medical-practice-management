import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { clinicalJson, consultationRouteError } from "@/modules/consultations/http";
import { addClinicalAddendum } from "@/modules/consultations/service";
import { consultationIdSchema } from "@/modules/consultations/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("clinical_notes.addendum", request.headers);
    const id = consultationIdSchema.parse((await context.params).id);
    const result = await addClinicalAddendum(id, await request.json().catch(() => null), actor);
    return clinicalJson({ addendum: result }, { status: 201 });
  } catch (error) {
    return consultationRouteError(error);
  }
}
