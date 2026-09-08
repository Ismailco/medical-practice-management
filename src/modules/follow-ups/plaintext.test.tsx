import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("follow-up plain-text rendering", () => {
  it("escapes HTML-looking reasons", () => {
    const reason = '<script>alert("follow-up")</script><img src=x onerror=alert(1)>';
    const html = renderToStaticMarkup(<p>{reason}</p>);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
