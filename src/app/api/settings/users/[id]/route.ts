import { z } from "zod";

import { noStoreJson, requireTrustedOrigin, safeRouteError } from "@/modules/auth/http";
import { requireCapability } from "@/modules/auth/session";
import { resetSecretaryPassword, setSecretaryActive } from "@/modules/users/service";
import { updateSecretarySchema } from "@/modules/users/validation";

export const runtime = "nodejs";

const parametersSchema = z.object({ id: z.string().uuid() });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireTrustedOrigin(request);
    const actor = await requireCapability("users.manage_secretaries", request.headers);
    const { id } = parametersSchema.parse(await context.params);
    const input = updateSecretarySchema.parse(await request.json().catch(() => null));

    if (input.action === "reset_password") {
      await resetSecretaryPassword({
        secretaryId: id,
        password: input.password,
        actorUserId: actor.id,
      });
    } else {
      await setSecretaryActive({
        secretaryId: id,
        active: input.action === "enable",
        actorUserId: actor.id,
      });
    }

    return noStoreJson({ ok: true });
  } catch (error) {
    return safeRouteError(error);
  }
}
