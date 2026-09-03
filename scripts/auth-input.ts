import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export async function ask(question: string): Promise<string> {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    return await readline.question(question);
  } finally {
    readline.close();
  }
}

export async function askHidden(question: string): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY || !stdin.setRawMode) {
    throw new Error("A terminal is required for hidden password entry.");
  }

  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };

    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003" || character === "\u0004") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        value += character;
      }
    };

    stdin.on("data", onData);
  });
}

export async function askConfirmedPassword(): Promise<string> {
  const password = await askHidden("Password: ");
  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  return password;
}
