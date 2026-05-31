import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";

describe("app integration", () => {
  it("health endpoint carries security headers", async () => {
    const res = await createApp().request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("unknown route returns 404 envelope", async () => {
    const res = await createApp().request("/api/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});
