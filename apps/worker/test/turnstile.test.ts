import { describe, it, expect } from "vitest";
import { verifyTurnstile } from "../src/http/turnstile";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("returns true when siteverify succeeds", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({ success: true }))).toBe(true);
  });
  it("returns false when siteverify fails", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({ success: false }))).toBe(false);
  });
  it("returns false on a non-200 response", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({}, false))).toBe(false);
  });
});
