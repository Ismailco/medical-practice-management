import "server-only";

import { hash, parseOptions, verify } from "@node-rs/argon2";

import { env } from "@/config/env";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const argon2Options = {
  algorithm: 2,
  version: 1,
  memoryCost: env.AUTH_ARGON2_MEMORY_KIB,
  timeCost: env.AUTH_ARGON2_TIME_COST,
  parallelism: env.AUTH_ARGON2_PARALLELISM,
  outputLen: 32,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, argon2Options);
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password);
  } catch {
    return false;
  }
}

export function readPasswordHashParameters(hashValue: string) {
  return parseOptions(hashValue);
}
