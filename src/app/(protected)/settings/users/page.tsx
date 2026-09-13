import { redirect } from "next/navigation";

import { hasCapability } from "@/modules/auth/capabilities";
import { getCurrentSession } from "@/modules/auth/session";
import { listSecretaries } from "@/modules/users/service";
import { UserManagement } from "./user-management";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        title="Staff accounts"
        description="Create and manage secretary access. The primary doctor account is managed separately during clinic setup."
      />
      <UserManagement users={users} />
    </section>
  );
}
