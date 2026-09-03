import { z } from "zod";

import { env } from "@/config/env";
import { logError } from "@/lib/logger";
import { recordAuditEvent } from "@/modules/audit/service";
import { auth } from "@/modules/auth/auth";
import { copySetCookieHeaders, hasTrustedOrigin, noStoreJson } from "@/modules/auth/http";
import {
  clearLoginFailures,
  createLoginThrottleKey,
  isLoginThrottled,
  recordLoginFailure,
} from "@/modules/auth/throttle";
import { normalizedEmailSchema, passwordSchema } from "@/modules/users/validation";

export const runtime = "nodejs";

const loginSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
  })
  .strict();

const successfulSignInSchema = z.object({
  user: z.object({ id: z.string().uuid() }),
});

function invalidCredentials(status = 401): Response {
  return noStoreJson({ error: "Invalid credentials." }, { status });
}

function createBetterAuthRequest(request: Request, body: z.infer<typeof loginSchema>): Request {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Request(new URL("/api/auth/sign-in/email", env.APP_URL), {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, rememberMe: true }),
  });
}

async function handleLogin(request: Request): Promise<Response> {
  if (!hasTrustedOrigin(request)) return invalidCredentials();

  const parsedBody = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return invalidCredentials(400);

  const throttleKey = createLoginThrottleKey(request, parsedBody.data.email);
  if (await isLoginThrottled(throttleKey)) {
    await recordAuditEvent({
      actorUserId: null,
      action: "AUTH_LOGIN_THROTTLED",
      entityType: "authentication",
      entityId: null,
      metadata: { reason: "IDENTIFIER_IP_LIMIT" },
    });
    return invalidCredentials(429);
  }

  const authResponse = await auth.handler(createBetterAuthRequest(request, parsedBody.data));

  if (!authResponse.ok) {
    const nowThrottled = await recordLoginFailure(throttleKey);
    await recordAuditEvent({
      actorUserId: null,
      action:
        nowThrottled || authResponse.status === 429 ? "AUTH_LOGIN_THROTTLED" : "AUTH_LOGIN_FAILED",
      entityType: "authentication",
      entityId: null,
      metadata: { reason: "INVALID_CREDENTIALS" },
    });
    return invalidCredentials(nowThrottled || authResponse.status === 429 ? 429 : 401);
  }

  const responseData = successfulSignInSchema.safeParse(await authResponse.clone().json());
  if (!responseData.success) return invalidCredentials();

  await clearLoginFailures(throttleKey);
  await recordAuditEvent({
    actorUserId: responseData.data.user.id,
    action: "AUTH_LOGIN_SUCCEEDED",
    entityType: "user",
    entityId: responseData.data.user.id,
    metadata: {},
  });

  const headers = new Headers();
  copySetCookieHeaders(authResponse, headers);
  return noStoreJson({ ok: true }, { status: 200, headers });
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await handleLogin(request);
  } catch {
    logError("Authentication operation failed", { errorCode: "AUTH_OPERATION_FAILED" });
    return noStoreJson({ error: "Unable to sign in." }, { status: 503 });
  }
}
