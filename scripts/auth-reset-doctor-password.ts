import { ask, askConfirmedPassword } from "./auth-input";
import { sqlClient } from "../src/db/client";
import { resetDoctorPassword } from "../src/modules/users/service";

async function main() {
  const email = await ask("Doctor email: ");
  const password = await askConfirmedPassword();
  await resetDoctorPassword({ email, password });
  process.stdout.write("Doctor password reset and existing sessions revoked.\n");
}

async function run() {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Doctor password reset failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

void run();
