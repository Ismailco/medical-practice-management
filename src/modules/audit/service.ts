import "server-only";

import type { InferInsertModel } from "drizzle-orm";

import { db } from "@/db/client";
import { auditLog } from "@/db/schema";

export type AuditEvent = Pick<
  InferInsertModel<typeof auditLog>,
  "actorUserId" | "action" | "entityType" | "entityId" | "metadata"
>;

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  await db.insert(auditLog).values(event);
}
