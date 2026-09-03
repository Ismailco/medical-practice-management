import { ask, askConfirmedPassword } from "./auth-input";
import { sqlClient } from "../src/db/client";
import { createInitialDoctor } from "../src/modules/users/service";

async function main() {
  const name = await ask("Doctor name: ");
  const email = await ask("Doctor email: ");
  const password = await askConfirmedPassword();
  const doctor = await createInitialDoctor({ name, email, password });
  process.stdout.write(`Doctor account created for ${doctor.email}.\n`);
}

async function run() {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Doctor account creation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

void run();
