import "server-only";

import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";

import { auth } from "@/modules/auth/auth";
import { db } from "@/db/client";
import { session, user } from "@/db/schema";
import { hasCapability, type Capability, type StaffRole } from "@/modules/auth/capabilities";
import { ForbiddenError, UnauthenticatedError } from "@/modules/auth/errors";

export type SafeUser = Readonly<{
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}>;

export type SafeSession = Readonly<{
  user: SafeUser;
  expiresAt: Date;
}>;

export async function getCurrentSession(requestHeaders?: Headers): Promise<SafeSession | null> {
  const effectiveHeaders = requestHeaders ?? (await headers());
  const authSession = await auth.api.getSession({ headers: effectiveHeaders }).catch(() => null);

  if (!authSession) return null;

  const now = new Date();
  const [record] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      expiresAt: session.expiresAt,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(
      and(
        eq(session.id, authSession.session.id),
        eq(user.id, authSession.user.id),
        gt(session.expiresAt, now),
      ),
    )
    .limit(1);

  if (!record?.active) {
    if (record) {
      await db.delete(session).where(eq(session.userId, record.id));
    }
    return null;
  }

  return {
    user: {
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
    },
    expiresAt: record.expiresAt,
  };
}

export async function requireSession(requestHeaders?: Headers): Promise<SafeSession> {
  const currentSession = await getCurrentSession(requestHeaders);
  if (!currentSession) throw new UnauthenticatedError();
  return currentSession;
}

export async function requireUser(requestHeaders?: Headers): Promise<SafeUser> {
  return (await requireSession(requestHeaders)).user;
}

export async function requireCapability(
  capability: Capability,
  requestHeaders?: Headers,
): Promise<SafeUser> {
  const currentUser = await requireUser(requestHeaders);
  if (!hasCapability(currentUser.role, capability)) throw new ForbiddenError();
  return currentUser;
}
