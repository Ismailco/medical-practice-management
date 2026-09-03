import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { env } from "@/config/env";
import { db } from "@/db/client";
import { loginThrottle } from "@/db/schema";

const FAILURE_LIMIT = 5;
const WINDOW_MILLISECONDS = 15 * 60 * 1000;
const RETENTION_MILLISECONDS = 24 * 60 * 60 * 1000;

function resolveReliableClientIp(request: Request): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (!forwardedFor) {
    return env.NODE_ENV === "production" ? null : "127.0.0.1";
  }

  const values = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length !== 1 || isIP(values[0] ?? "") === 0) {
    return null;
  }

  return values[0]!.toLowerCase();
}

export function createLoginThrottleKey(request: Request, normalizedEmail: string): string | null {
  const clientIp = resolveReliableClientIp(request);
  if (!clientIp) return null;

  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`login\0${normalizedEmail}\0${clientIp}`)
    .digest("hex");
}

export async function isLoginThrottled(keyHash: string | null): Promise<boolean> {
  if (!keyHash) return false;

  const now = new Date();
  const cleanupBefore = new Date(now.getTime() - RETENTION_MILLISECONDS);

  await db
    .delete(loginThrottle)
    .where(
      and(
        lt(loginThrottle.updatedAt, cleanupBefore),
        or(isNull(loginThrottle.blockedUntil), lt(loginThrottle.blockedUntil, now)),
      ),
    );

  const [record] = await db
    .select({ blockedUntil: loginThrottle.blockedUntil })
    .from(loginThrottle)
    .where(eq(loginThrottle.keyHash, keyHash))
    .limit(1);

  return record?.blockedUntil !== null && record?.blockedUntil !== undefined
    ? record.blockedUntil > now
    : false;
}

export async function recordLoginFailure(keyHash: string | null): Promise<boolean> {
  if (!keyHash) return false;

  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MILLISECONDS);
  const blockedUntil = new Date(now.getTime() + WINDOW_MILLISECONDS);
  const nowIso = now.toISOString();
  const windowStartIso = windowStart.toISOString();
  const blockedUntilIso = blockedUntil.toISOString();

  const result = await db.execute<{ blocked_until: string | null }>(sql`
    INSERT INTO ${loginThrottle} (
      key_hash,
      failed_attempts,
      window_started_at,
      blocked_until,
      updated_at
    )
    VALUES (${keyHash}, 1, ${nowIso}, NULL, ${nowIso})
    ON CONFLICT (key_hash) DO UPDATE SET
      failed_attempts = CASE
        WHEN ${loginThrottle.windowStartedAt} < ${windowStartIso} THEN 1
        ELSE ${loginThrottle.failedAttempts} + 1
      END,
      window_started_at = CASE
        WHEN ${loginThrottle.windowStartedAt} < ${windowStartIso} THEN ${nowIso}
        ELSE ${loginThrottle.windowStartedAt}
      END,
      blocked_until = CASE
        WHEN (
          CASE
            WHEN ${loginThrottle.windowStartedAt} < ${windowStartIso} THEN 1
            ELSE ${loginThrottle.failedAttempts} + 1
          END
        ) >= ${FAILURE_LIMIT} THEN ${blockedUntilIso}
        ELSE ${loginThrottle.blockedUntil}
      END,
      updated_at = ${nowIso}
    RETURNING blocked_until
  `);

  const nextBlockedUntil = result[0]?.blocked_until;
  return nextBlockedUntil ? new Date(nextBlockedUntil) > now : false;
}

export async function clearLoginFailures(keyHash: string | null): Promise<void> {
  if (!keyHash) return;
  await db.delete(loginThrottle).where(eq(loginThrottle.keyHash, keyHash));
}
