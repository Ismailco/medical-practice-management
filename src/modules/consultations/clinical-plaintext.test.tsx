import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("clinical plain-text rendering", () => {
  it("escapes HTML-looking clinical content", () => {
    const content = '<script>alert("clinical")</script><img src=x onerror=alert(1)>';
    const html = renderToStaticMarkup(<p>{content}</p>);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });
});
