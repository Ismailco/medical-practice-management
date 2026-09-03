import "server-only";

import { redirect } from "next/navigation";

import { hasCapability, type Capability } from "./capabilities";
import { getCurrentSession, type SafeUser } from "./session";

export async function requirePageCapability(capability: Capability): Promise<SafeUser> {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");
  if (!hasCapability(currentSession.user.role, capability)) redirect("/dashboard");
  return currentSession.user;
}
