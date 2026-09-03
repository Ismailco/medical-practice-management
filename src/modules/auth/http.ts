import "server-only";

import { ZodError } from "zod";

import { env } from "@/config/env";
import { logError } from "@/lib/logger";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/modules/auth/errors";

export function noStoreJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function safeRouteError(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return noStoreJson({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return noStoreJson({ error: "Forbidden." }, { status: 403 });
  }
  if (error instanceof ConflictError) {
    return noStoreJson({ error: error.message }, { status: 409 });
  }
  if (error instanceof NotFoundError) {
    return noStoreJson({ error: "Not found." }, { status: 404 });
  }
  if (error instanceof ZodError) {
    return noStoreJson({ error: "Invalid request." }, { status: 400 });
  }

  logError("Protected operation failed", { errorCode: "PROTECTED_OPERATION_FAILED" });
  return noStoreJson({ error: "The operation could not be completed." }, { status: 500 });
}

export function copySetCookieHeaders(source: Response, target: Headers): void {
  for (const cookie of source.headers.getSetCookie()) {
    target.append("Set-Cookie", cookie);
  }
}

export function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(env.APP_URL).origin;
  } catch {
    return false;
  }
}

export function requireTrustedOrigin(request: Request): void {
  if (!hasTrustedOrigin(request)) throw new ForbiddenError();
}
