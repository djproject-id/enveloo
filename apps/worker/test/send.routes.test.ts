import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { accounts, inviteKeys, users } from "../src/db/schema";
import { eq } from "drizzle-orm";

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
    const url = String(input);
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "msg_abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

function jsonReq(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new Request(`https://x${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

async function registerAndLogin(app: ReturnType<typeof createApp>) {
  await app.fetch(
    jsonReq("/api/auth/register", {
      email: "owner@example.com",
      password: "supersecret1",
      turnstileToken: "t",
      inviteCode: "GOLDEN",
    }),
    env,
  );
  const login = await app.fetch(
    jsonReq("/api/auth/login", {
      email: "owner@example.com",
      password: "supersecret1",
      turnstileToken: "t",
    }),
    env,
  );
  return getSetCookie(login)
    .map((c) => c.split(";")[0])
    .join("; ");
}

describe("send flow", () => {
  it("sends from an owned address and stores a sent copy", async () => {
    const app = createApp();
    const d = db(env.DB);
    const cookie = await registerAndLogin(app);
    const user = await d.select().from(users).where(eq(users.email, "owner@example.com")).get();
    await d.insert(accounts).values({ email: "me@mydomain.com", userId: user!.id, createdAt: 0 }).run();

    const send = await app.fetch(
      jsonReq(
        "/api/emails/send",
        { from: "me@mydomain.com", to: "friend@example.com", subject: "Hi", text: "hello" },
        cookie,
      ),
      env,
    );
    expect(send.status).toBe(200);
    const sendBody = (await send.json()) as { data: { id: string } };
    expect(sendBody.data.id).toBe("msg_abc");

    const list = await app.fetch(new Request("https://x/api/emails", { headers: { cookie } }), env);
    const listBody = (await list.json()) as { data: { direction: string; toAddress: string }[] };
    expect(listBody.data.length).toBe(1);
    expect(listBody.data[0]!.direction).toBe("sent");
    expect(listBody.data[0]!.toAddress).toBe("friend@example.com");
  });

  it("rejects sending from an address the user does not own", async () => {
    const app = createApp();
    const cookie = await registerAndLogin(app);
    const send = await app.fetch(
      jsonReq(
        "/api/emails/send",
        { from: "notmine@mydomain.com", to: "friend@example.com", subject: "Hi", text: "hello" },
        cookie,
      ),
      env,
    );
    expect(send.status).toBe(403);
  });
});
