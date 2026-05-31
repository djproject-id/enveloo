import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createSession, getSession, revokeSession } from "../src/auth/session";

describe("session store", () => {
  it("creates, reads, and revokes a session", async () => {
    await createSession(env.KV, 5, "sid-1", 3600);
    const s = await getSession(env.KV, 5, "sid-1");
    expect(s?.userId).toBe(5);
    await revokeSession(env.KV, 5, "sid-1");
    expect(await getSession(env.KV, 5, "sid-1")).toBeNull();
  });

  it("returns null for an unknown session", async () => {
    expect(await getSession(env.KV, 1, "missing")).toBeNull();
  });
});
