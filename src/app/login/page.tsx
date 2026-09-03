import { redirect } from "next/navigation";

import { getCurrentSession } from "@/modules/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-wider text-teal-800 uppercase">Staff access</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Clinic Management
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in with the staff account provided by your clinic operator.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
