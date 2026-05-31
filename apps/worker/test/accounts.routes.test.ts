import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { inviteKeys } from "../src/db/schema";

const getSetCookie = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

const realFetch = globalThis.fetch;
beforeEach(async () => {
  for (const t of [
    "attachments",
    "emails",
    "accounts",
    "users",
    "invite_keys",
    "role_permissions",
    "permissions",
    "roles",
  ]) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }
  const d = db(env.DB);
  await seedRbac(d);
  await d
    .insert(inviteKeys)
    .values({ code: "GOLDEN", maxUses: 5, uses: 0, roleId: 0, createdAt: 0 })
    .run();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

function jsonReq(path: string, body: unknown) {
  return new Request(`https://x${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function registerAndLogin(app: ReturnType<typeof createApp>): Promise<string> {
  await app.fetch(
    jsonReq("/api/auth/register", {
      email: "alice@example.com",
      password: "supersecret1",
      turnstileToken: "t",
      inviteCode: "GOLDEN",
    }),
    env,
  );
  const login = await app.fetch(
    jsonReq("/api/auth/login", {
      email: "alice@example.com",
      password: "supersecret1",
      turnstileToken: "t",
    }),
    env,
  );
  return getSetCookie(login)
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("accounts API", () => {
  it("creates, lists, and deletes an account", async () => {
    const app = createApp();
    const cookie = await registerAndLogin(app);

    // POST /api/accounts → 201
    const createRes = await app.fetch(
      new Request("https://x/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ localPart: "hello", domain: "mydomain.com" }),
      }),
      env,
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as { data: { id: number; email: string } };
    expect(createBody.data.email).toBe("hello@mydomain.com");
    const accountId = createBody.data.id;

    // GET /api/accounts → 1 row
    const list = await app.fetch(
      new Request("https://x/api/accounts", { headers: { cookie } }),
      env,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { data: { id: number }[] };
    expect(listBody.data.length).toBe(1);

    // DELETE /api/accounts/:id → 200
    const del = await app.fetch(
      new Request(`https://x/api/accounts/${accountId}`, {
        method: "DELETE",
        headers: { cookie },
      }),
      env,
    );
    expect(del.status).toBe(200);
    const delBody = (await del.json()) as { data: { deleted: boolean } };
    expect(delBody.data.deleted).toBe(true);

    // GET /api/accounts → 0 rows
    const list2 = await app.fetch(
      new Request("https://x/api/accounts", { headers: { cookie } }),
      env,
    );
    const list2Body = (await list2.json()) as { data: unknown[] };
    expect(list2Body.data.length).toBe(0);
  });

  it("rejects a domain not in the allowlist with 400", async () => {
    const app = createApp();
    const cookie = await registerAndLogin(app);

    const res = await app.fetch(
      new Request("https://x/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ localPart: "hello", domain: "evil.com" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DOMAIN_NOT_ALLOWED");
  });

  it("returns 409 when the same email address is registered twice", async () => {
    const app = createApp();
    const cookie = await registerAndLogin(app);

    const first = await app.fetch(
      new Request("https://x/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ localPart: "hello", domain: "mydomain.com" }),
      }),
      env,
    );
    expect(first.status).toBe(201);

    const second = await app.fetch(
      new Request("https://x/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ localPart: "hello", domain: "mydomain.com" }),
      }),
      env,
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("EMAIL_TAKEN");
  });

  it("returns 401 when listing accounts without auth cookie", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("https://x/api/accounts"), env);
    expect(res.status).toBe(401);
  });
});
