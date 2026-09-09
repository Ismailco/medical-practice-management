import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const findings: string[] = [];
for (const file of files) {
  if (file === ".env.example" || file === ".env.test.example" || file === "compose.yaml") continue;
  const content = readFileSync(file, "utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(content))
    findings.push(`${file}: private key material`);
  if (
    /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/iu.test(content) &&
    !/synthetic|test|demo|placeholder/iu.test(content)
  ) {
    findings.push(`${file}: possible credentialed database URL`);
  }
}
if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${files.length} tracked files.`);
}
