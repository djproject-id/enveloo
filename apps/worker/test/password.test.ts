import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const { hash, salt } = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", salt, hash)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("correct horse");
    expect(await verifyPassword("battery staple", salt, hash)).toBe(false);
  });
  it("produces a different salt each time", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});
