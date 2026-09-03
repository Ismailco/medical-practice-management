import { redirect } from "next/navigation";

import { hasCapability } from "@/modules/auth/capabilities";
import { getCurrentSession } from "@/modules/auth/session";
import { listSecretaries } from "@/modules/users/service";
import { UserManagement } from "./user-management";

export default async function UsersSettingsPage() {
  const currentSession = await getCurrentSession();
  if (!currentSession) redirect("/login");
  const currentUser = currentSession.user;
  if (!hasCapability(currentUser.role, "users.manage_secretaries")) redirect("/dashboard");

  const users = (await listSecretaries()).map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
  }));

  return (
    <section>
      <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">Settings</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Staff accounts</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Create and manage secretary access. Doctor accounts can only be created through the operator
        bootstrap command.
      </p>
      <UserManagement users={users} />
    </section>
  );
}
