import { sqlClient } from "@/db/client";

export default async function globalSetup(): Promise<() => Promise<void>> {
  return async () => {
    await sqlClient.end();
  };
}
