import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { health } from "../src/routes/health";
import { Hono } from "hono";
import type { Env } from "../src/env";

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.route("/api", health);
  return a;
}

describe("GET /api/health", () => {
  it("returns ok:true and a reachable db flag", async () => {
    const res = await app().request("/api/health", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { ok: true, db: true } });
  });
});
