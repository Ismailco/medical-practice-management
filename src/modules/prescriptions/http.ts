import "server-only";

import { ZodError } from "zod";

import { safeRouteError } from "@/modules/auth/http";

export function prescriptionJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function prescriptionRouteError(error: unknown): Response {
  if (error instanceof ZodError) {
    return prescriptionJson({ error: "Please correct the highlighted fields." }, { status: 400 });
  }
  const response = safeRouteError(error);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}
