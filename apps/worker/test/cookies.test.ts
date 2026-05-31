import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  setAuthCookies,
  clearAuthCookies,
  ACCESS_COOKIE,
  REFRESH_COOKIE,
} from "../src/http/cookies";

const getSetCookie = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

describe("auth cookies", () => {
  it("sets HttpOnly, Secure, SameSite=Strict access and refresh cookies", async () => {
    const app = new Hono();
    app.get("/x", (c) => {
      setAuthCookies(c, "acc", "ref");
      return c.text("ok");
    });
    const res = await app.request("/x");
    const cookies = getSetCookie(res);
    const access = cookies.find((c) => c.startsWith(`${ACCESS_COOKIE}=`)) ?? "";
    const refresh = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE}=`)) ?? "";
    expect(access).toContain("HttpOnly");
    expect(access).toContain("Secure");
    expect(access).toContain("SameSite=Strict");
    expect(refresh).toContain("HttpOnly");
  });

  it("clears cookies", async () => {
    const app = new Hono();
    app.get("/x", (c) => {
      clearAuthCookies(c);
      return c.text("ok");
    });
    const res = await app.request("/x");
    const cookies = getSetCookie(res).join("\n");
    expect(cookies).toContain(`${ACCESS_COOKIE}=`);
    expect(cookies).toContain("Max-Age=0");
  });
});
