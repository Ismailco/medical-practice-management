import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { followUpJson, followUpRouteError } from "@/modules/follow-ups/http";
import { completeFollowUp } from "@/modules/follow-ups/service";
import { followUpIdSchema } from "@/modules/follow-ups/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("followups.transition", request.headers);
    const id = followUpIdSchema.parse((await context.params).id);
    const updated = await completeFollowUp(id, await request.json().catch(() => null), actor);
    return followUpJson({ followUp: updated });
  } catch (error) {
    return followUpRouteError(error);
  }
}
