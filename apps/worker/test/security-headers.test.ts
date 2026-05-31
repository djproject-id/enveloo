import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "../src/http/security-headers";

function appWithHeaders() {
  const app = new Hono();
  app.use("*", securityHeaders());
  app.get("/x", (c) => c.text("ok"));
  return app;
}

describe("securityHeaders", () => {
  it("sets HSTS, nosniff, frame-ancestors none, referrer policy, and a CSP", async () => {
    const res = await appWithHeaders().request("/x");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
