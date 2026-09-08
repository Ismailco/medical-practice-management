import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("prescription plaintext rendering", () => {
  it("escapes script-looking physician text", () => {
    const marker = '<script>alert("rx")</script>';
    const html = renderToStaticMarkup(<p>{marker}</p>);
    expect(html).not.toContain(marker);
    expect(html).toContain("&lt;script&gt;");
  });
});
