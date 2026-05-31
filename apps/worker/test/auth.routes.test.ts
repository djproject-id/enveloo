import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { inviteKeys, roles } from "../src/db/schema";

const TURNSTILE_OK = { "content-type": "application/json" };

const getSetCookie = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

const realFetch = globalThis.fetch;
beforeEach(async () => {
  await env.DB.exec("DELETE FROM users");
  await env.DB.exec("DELETE FROM invite_keys");
  await env.DB.exec("DELETE FROM role_permissions");
  await env.DB.exec("DELETE FROM permissions");
  await env.DB.exec("DELETE FROM roles");

  const d = db(env.DB);
  await seedRbac(d);
  await d
    .insert(inviteKeys)
    .values({ code: "GOLDEN", maxUses: 5, uses: 0, roleId: 0, createdAt: 0 })
    .run();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: TURNSTILE_OK });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

function jsonReq(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new Request(`https://x${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("auth flow", () => {
  it("registers, logs in, accesses /me, and logs out", async () => {
    const app = createApp();

    const reg = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "u@example.com",
        password: "supersecret1",
        turnstileToken: "t",
        inviteCode: "GOLDEN",
      }),
      env,
    );
    expect(reg.status).toBe(201);

    const login = await app.fetch(
      jsonReq("/api/auth/login", {
        email: "u@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(login.status).toBe(200);
    const setCookie = getSetCookie(login).join("; ");
    expect(setCookie).toContain("access_token=");

    const cookieHeader = getSetCookie(login)
      .map((c) => c.split(";")[0])
      .join("; ");

    const me = await app.fetch(
      new Request("https://x/api/auth/me", { headers: { cookie: cookieHeader } }),
      env,
    );
    expect(me.status).toBe(200);
    const meBody = await me.json();
    expect(meBody).toMatchObject({ success: true, data: { admin: false } });

    const logout = await app.fetch(
      new Request("https://x/api/auth/logout", {
        method: "POST",
        headers: { cookie: cookieHeader },
      }),
      env,
    );
    expect(logout.status).toBe(200);

    const meAfter = await app.fetch(
      new Request("https://x/api/auth/me", { headers: { cookie: cookieHeader } }),
      env,
    );
    expect(meAfter.status).toBe(401);
  });

  it("rejects registration with a bad invite code", async () => {
    const app = createApp();
    const reg = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "v@example.com",
        password: "supersecret1",
        turnstileToken: "t",
        inviteCode: "WRONG",
      }),
      env,
    );
    expect(reg.status).toBe(400);
  });

  it("rejects login with a wrong password", async () => {
    const app = createApp();
    await app.fetch(
      jsonReq("/api/auth/register", {
        email: "w@example.com",
        password: "supersecret1",
        turnstileToken: "t",
        inviteCode: "GOLDEN",
      }),
      env,
    );
    const login = await app.fetch(
      jsonReq("/api/auth/login", {
        email: "w@example.com",
        password: "wrongpassword",
        turnstileToken: "t",
      }),
      env,
    );
    expect(login.status).toBe(401);
  });
});

describe("bootstrap", () => {
  // Fresh-DB setup: wipe everything, no seedRbac, no invite keys.
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM users");
    await env.DB.exec("DELETE FROM invite_keys");
    await env.DB.exec("DELETE FROM role_permissions");
    await env.DB.exec("DELETE FROM permissions");
    await env.DB.exec("DELETE FROM roles");

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("siteverify")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return realFetch(input as RequestInfo, init);
    }) as typeof fetch;
  });

  it("Test A: first admin registers without invite on a fresh DB (201) and RBAC is seeded", async () => {
    const app = createApp();
    const res = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "admin@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(res.status).toBe(201);

    // Verify RBAC was auto-seeded: default role must now exist.
    const d = db(env.DB);
    const allRoles = await d.select().from(roles).all();
    expect(allRoles.length).toBeGreaterThan(0);
    expect(allRoles.some((r) => r.isDefault === 1)).toBe(true);
  });

  it("Test B: non-admin without invite on fresh DB gets 400 (invite required)", async () => {
    const app = createApp();
    const res = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "nobody@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVITE");
  });

  it("Test C: after admin registers, second attempt for admin email without invite gets 400", async () => {
    const app = createApp();

    // First: admin registers successfully.
    const first = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "admin@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(first.status).toBe(201);

    // Second: same admin email again — users table is non-empty, invite required.
    const second = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "admin@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(second.status).toBe(400);
    const body = await second.json() as { error: { code: string } };
    expect(body.error.code).toBe("INVITE");
  });
});
