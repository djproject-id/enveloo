import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { users, inviteKeys, rolePermissions, permissions, roles } from "../src/db/schema";

const TURNSTILE_OK = { "content-type": "application/json" };

const getSetCookie = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

function cookieHeader(res: Response): string {
  return getSetCookie(res)
    .map((c) => c.split(";")[0])
    .join("; ");
}

function jsonReq(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new Request(`https://x${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

const realFetch = globalThis.fetch;

beforeEach(async () => {
  await env.DB.exec("DELETE FROM users");
  await env.DB.exec("DELETE FROM invite_keys");
  await env.DB.exec("DELETE FROM role_permissions");
  await env.DB.exec("DELETE FROM permissions");
  await env.DB.exec("DELETE FROM roles");

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: TURNSTILE_OK });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

async function adminLogin(): Promise<string> {
  const app = createApp();

  // Register admin (first user on fresh DB — no invite needed).
  const reg = await app.fetch(
    jsonReq("/api/auth/register", {
      email: "admin@example.com",
      password: "supersecret1",
      turnstileToken: "t",
    }),
    env,
  );
  expect(reg.status).toBe(201);

  // Login.
  const login = await app.fetch(
    jsonReq("/api/auth/login", {
      email: "admin@example.com",
      password: "supersecret1",
      turnstileToken: "t",
    }),
    env,
  );
  expect(login.status).toBe(200);

  return cookieHeader(login);
}

describe("admin invite management", () => {
  it("admin creates invite, list reflects it, invite works for registration, delete removes it", async () => {
    const app = createApp();
    const adminCookie = await adminLogin();

    // POST /api/admin/invites
    const createRes = await app.fetch(
      jsonReq("/api/admin/invites", { maxUses: 3 }, adminCookie),
      env,
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json() as { success: boolean; data: { id: number; code: string; maxUses: number } };
    expect(createBody.success).toBe(true);
    expect(typeof createBody.data.code).toBe("string");
    expect(createBody.data.code.length).toBeGreaterThan(0);
    expect(createBody.data.maxUses).toBe(3);
    const { id, code } = createBody.data;

    // GET /api/admin/invites → length 1
    const listRes = await app.fetch(
      new Request("https://x/api/admin/invites", { headers: { cookie: adminCookie } }),
      env,
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { success: boolean; data: unknown[] };
    expect(listBody.success).toBe(true);
    expect(listBody.data.length).toBe(1);

    // Use the generated code to register a new user (end-to-end proof).
    const friendReg = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "friend@example.com",
        password: "supersecret1",
        turnstileToken: "t",
        inviteCode: code,
      }),
      env,
    );
    expect(friendReg.status).toBe(201);

    // DELETE /api/admin/invites/:id
    const deleteRes = await app.fetch(
      new Request(`https://x/api/admin/invites/${id}`, {
        method: "DELETE",
        headers: { cookie: adminCookie },
      }),
      env,
    );
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json() as { success: boolean; data: { deleted: boolean } };
    expect(deleteBody.data.deleted).toBe(true);

    // GET again → length 0
    const listRes2 = await app.fetch(
      new Request("https://x/api/admin/invites", { headers: { cookie: adminCookie } }),
      env,
    );
    const listBody2 = await listRes2.json() as { success: boolean; data: unknown[] };
    expect(listBody2.data.length).toBe(0);
  });

  it("non-admin user receives 403 on admin endpoints", async () => {
    const app = createApp();
    const adminCookie = await adminLogin();

    // Admin creates an invite for friend2.
    const createRes = await app.fetch(
      jsonReq("/api/admin/invites", { maxUses: 1 }, adminCookie),
      env,
    );
    expect(createRes.status).toBe(201);
    const { code } = (await createRes.json() as { data: { code: string } }).data;

    // Register friend2 with that invite.
    const regFriend = await app.fetch(
      jsonReq("/api/auth/register", {
        email: "friend2@example.com",
        password: "supersecret1",
        turnstileToken: "t",
        inviteCode: code,
      }),
      env,
    );
    expect(regFriend.status).toBe(201);

    // Login as friend2.
    const loginFriend = await app.fetch(
      jsonReq("/api/auth/login", {
        email: "friend2@example.com",
        password: "supersecret1",
        turnstileToken: "t",
      }),
      env,
    );
    expect(loginFriend.status).toBe(200);
    const friendCookie = cookieHeader(loginFriend);

    // friend2 should be forbidden from admin routes.
    const forbiddenRes = await app.fetch(
      new Request("https://x/api/admin/invites", { headers: { cookie: friendCookie } }),
      env,
    );
    expect(forbiddenRes.status).toBe(403);
    const body = await forbiddenRes.json() as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("unauthenticated request returns 401", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("https://x/api/admin/invites"),
      env,
    );
    expect(res.status).toBe(401);
  });
});
