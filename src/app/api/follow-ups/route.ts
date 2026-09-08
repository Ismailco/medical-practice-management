import { requireTrustedOrigin } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { followUpJson, followUpRouteError } from "@/modules/follow-ups/http";
import { listOperationalFollowUps } from "@/modules/follow-ups/repository";
import { createFollowUp } from "@/modules/follow-ups/service";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireCapability("followups.read_sensitive", request.headers);
    return followUpJson({ followUps: await listOperationalFollowUps() });
  } catch (error) {
    return followUpRouteError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("followups.create", request.headers);
    const created = await createFollowUp(await request.json().catch(() => null), actor);
    return followUpJson({ followUp: created }, { status: 201 });
  } catch (error) {
    return followUpRouteError(error);
  }
}
