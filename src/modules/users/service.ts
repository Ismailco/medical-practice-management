import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { account, auditLog, session, user } from "@/db/schema";
import type { StaffRole } from "@/modules/auth/capabilities";
import { ConflictError, NotFoundError } from "@/modules/auth/errors";
import { hashPassword } from "@/modules/auth/password";
import {
  createSecretarySchema,
  normalizedEmailSchema,
  passwordSchema,
  staffNameSchema,
} from "./validation";

export type StaffUserSummary = Readonly<{
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: Date;
}>;

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === "23505") return true;
    if (!("cause" in current)) return false;
    current = current.cause;
  }

  return false;
}

async function createCredentialUser(input: {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  actorUserId: string | null;
}): Promise<StaffUserSummary> {
  const name = staffNameSchema.parse(input.name);
  const email = normalizedEmailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const passwordHash = await hashPassword(password);

  try {
    return await db.transaction(async (transaction) => {
      const [createdUser] = await transaction
        .insert(user)
        .values({ name, email, role: input.role, active: true, emailVerified: false })
        .returning({
          id: user.id,
          name: user.name,
          email: user.email,
          active: user.active,
          createdAt: user.createdAt,
        });

      if (!createdUser) throw new Error("User insert returned no record.");

      await transaction.insert(account).values({
        issuer: "local:credential",
        accountId: createdUser.id,
        providerId: "credential",
        userId: createdUser.id,
        password: passwordHash,
      });

      await transaction.insert(auditLog).values({
        actorUserId: input.actorUserId,
        action: input.role === "DOCTOR" ? "USER_DOCTOR_BOOTSTRAPPED" : "USER_SECRETARY_CREATED",
        entityType: "user",
        entityId: createdUser.id,
        metadata: { role: input.role },
      });

      return createdUser;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new ConflictError("That login identifier is already in use.");
    throw error;
  }
}

export function createSecretary(input: unknown, actorUserId: string): Promise<StaffUserSummary> {
  const parsed = createSecretarySchema.parse(input);
  return createCredentialUser({ ...parsed, role: "SECRETARY", actorUserId });
}

export function createInitialDoctor(input: {
  name: string;
  email: string;
  password: string;
}): Promise<StaffUserSummary> {
  return createCredentialUser({ ...input, role: "DOCTOR", actorUserId: null });
}

export async function listSecretaries(): Promise<readonly StaffUserSummary[]> {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.role, "SECRETARY"))
    .orderBy(user.name, user.email);
}

export async function setSecretaryActive(input: {
  secretaryId: string;
  active: boolean;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(user)
      .set({ active: input.active, updatedAt: new Date() })
      .where(and(eq(user.id, input.secretaryId), eq(user.role, "SECRETARY")))
      .returning({ id: user.id });

    if (!updated) throw new NotFoundError();

    if (!input.active) {
      await transaction.delete(session).where(eq(session.userId, updated.id));
    }

    await transaction.insert(auditLog).values({
      actorUserId: input.actorUserId,
      action: input.active ? "USER_SECRETARY_ENABLED" : "USER_SECRETARY_DISABLED",
      entityType: "user",
      entityId: updated.id,
      metadata: {},
    });
  });
}

export async function resetSecretaryPassword(input: {
  secretaryId: string;
  password: string;
  actorUserId: string;
}): Promise<void> {
  const password = passwordSchema.parse(input.password);
  const passwordHash = await hashPassword(password);

  await db.transaction(async (transaction) => {
    const [secretary] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, input.secretaryId), eq(user.role, "SECRETARY")))
      .limit(1);

    if (!secretary) throw new NotFoundError();

    const [updatedAccount] = await transaction
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, secretary.id),
          eq(account.providerId, "credential"),
          eq(account.issuer, "local:credential"),
        ),
      )
      .returning({ id: account.id });

    if (!updatedAccount) throw new NotFoundError();

    await transaction.delete(session).where(eq(session.userId, secretary.id));
    await transaction.insert(auditLog).values({
      actorUserId: input.actorUserId,
      action: "USER_SECRETARY_PASSWORD_RESET",
      entityType: "user",
      entityId: secretary.id,
      metadata: {},
    });
  });
}

export async function resetDoctorPassword(input: {
  email: string;
  password: string;
}): Promise<void> {
  const email = normalizedEmailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const passwordHash = await hashPassword(password);

  await db.transaction(async (transaction) => {
    const [doctor] = await transaction
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.email, email), eq(user.role, "DOCTOR")))
      .limit(1);

    if (!doctor) throw new NotFoundError();

    const [updatedAccount] = await transaction
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, doctor.id),
          eq(account.providerId, "credential"),
          eq(account.issuer, "local:credential"),
        ),
      )
      .returning({ id: account.id });

    if (!updatedAccount) throw new NotFoundError();
    await transaction.delete(session).where(eq(session.userId, doctor.id));
    await transaction.insert(auditLog).values({
      actorUserId: null,
      action: "USER_DOCTOR_PASSWORD_RESET",
      entityType: "user",
      entityId: doctor.id,
      metadata: { source: "operator_cli" },
    });
  });
}
