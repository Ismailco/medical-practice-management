import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") || path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("release security regressions", () => {
  it("does not render application source with dangerous HTML or persistent browser storage", () => {
    const files = sourceFiles(join(process.cwd(), "src"));
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(source).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
  });

  it("keeps state-changing application routes behind the shared origin guard", () => {
    const files = sourceFiles(join(process.cwd(), "src/app/api"));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (
        /export async function (POST|PATCH|PUT|DELETE)/u.test(source) &&
        !file.includes("/auth/")
      ) {
        expect(source, file).toContain("requireTrustedOrigin");
      }
    }
  });
});
