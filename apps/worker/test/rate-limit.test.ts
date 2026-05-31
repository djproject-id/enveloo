import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { rateLimit } from "../src/http/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const key = "test-ip-1";
    const r1 = await rateLimit(env.KV, key, 2, 60);
    const r2 = await rateLimit(env.KV, key, 2, 60);
    const r3 = await rateLimit(env.KV, key, 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });
});
