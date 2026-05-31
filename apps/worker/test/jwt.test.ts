import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "../src/auth/jwt";

const SECRET = "unit-secret";

describe("jwt", () => {
  it("round-trips a payload", async () => {
    const token = await signJwt(SECRET, { sub: 7, sid: "abc", adm: true }, 60);
    const payload = await verifyJwt(SECRET, token);
    expect(payload?.sub).toBe(7);
    expect(payload?.sid).toBe("abc");
    expect(payload?.adm).toBe(true);
  });
  it("rejects a tampered signature", async () => {
    const token = await signJwt(SECRET, { sub: 1 }, 60);
    expect(await verifyJwt(SECRET, token + "x")).toBeNull();
  });
  it("rejects a wrong secret", async () => {
    const token = await signJwt(SECRET, { sub: 1 }, 60);
    expect(await verifyJwt("other", token)).toBeNull();
  });
  it("rejects an expired token", async () => {
    const token = await signJwt(SECRET, { sub: 1 }, -1);
    expect(await verifyJwt(SECRET, token)).toBeNull();
  });
});
