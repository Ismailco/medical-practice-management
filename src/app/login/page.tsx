import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-mark" aria-hidden="true">
          CM
        </div>
        <p className="login-kicker">Staff sign in</p>
        <h1 className="login-title">Clinic Management</h1>
        <p className="login-description">
          Use the staff account provided by your clinic administrator.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
