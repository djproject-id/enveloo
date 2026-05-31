import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "../src/email/sanitize";

describe("sanitizeEmailHtml", () => {
  it("removes script tags and their content", async () => {
    const out = await sanitizeEmailHtml(`<p>hi</p><script>alert(1)</script>`);
    expect(out).toContain("hi");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips inline event handlers", async () => {
    const out = await sanitizeEmailHtml(`<p onclick="evil()">x</p>`);
    expect(out).not.toContain("onclick");
    expect(out).toContain("x");
  });

  it("strips javascript: URLs", async () => {
    const out = await sanitizeEmailHtml(`<a href="javascript:evil()">l</a>`);
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("strips data: and vbscript: URLs but keeps http/https/mailto and relative", async () => {
    const out = await sanitizeEmailHtml(
      `<a href="data:text/html,x">d</a><a href="vbscript:x">v</a>` +
        `<a href="https://ok.com">h</a><a href="mailto:a@b.com">m</a><a href="/rel">r</a>`,
    );
    expect(out.toLowerCase()).not.toContain("data:");
    expect(out.toLowerCase()).not.toContain("vbscript:");
    expect(out).toContain("https://ok.com");
    expect(out).toContain("mailto:a@b.com");
    expect(out).toContain('href="/rel"');
  });

  it("removes iframes and forms", async () => {
    const out = await sanitizeEmailHtml(`<iframe src="x"></iframe><form action="y"></form>ok`);
    expect(out.toLowerCase()).not.toContain("<iframe");
    expect(out.toLowerCase()).not.toContain("<form");
    expect(out).toContain("ok");
  });
});
