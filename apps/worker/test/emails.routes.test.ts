import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { accounts, inviteKeys, users } from "../src/db/schema";
import { ingestEmail } from "../src/email/receive";
import { eq } from "drizzle-orm";

const getSetCookie = (res: Response): string[] =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie();

const RAW = [
  "From: Carol <carol@example.com>",
  "To: inbox@mydomain.com",
  "Subject: Welcome",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p onclick="x()">Hello world<script>alert(1)</script></p>',
  "",
].join("\r\n");

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

describe("receive + read flow", () => {
  it("ingested mail is listed and readable (sanitized) by its owner", async () => {
    const app = createApp();
    const d = db(env.DB);

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
    const cookie = getSetCookie(login)
      .map((c) => c.split(";")[0])
      .join("; ");

    const user = await d.select().from(users).where(eq(users.email, "owner@example.com")).get();
    await d
      .insert(accounts)
      .values({ email: "inbox@mydomain.com", userId: user!.id, createdAt: 0 })
      .run();

    const stored = await ingestEmail(env, "inbox@mydomain.com", RAW);
    expect(stored).toBe(true);

    const list = await app.fetch(new Request("https://x/api/emails", { headers: { cookie } }), env);
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { data: { id: number }[] };
    expect(listBody.data.length).toBe(1);
    const emailId = listBody.data[0]!.id;

    const detail = await app.fetch(
      new Request(`https://x/api/emails/${emailId}`, { headers: { cookie } }),
      env,
    );
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { data: { html: string } };
    expect(detailBody.data.html).toContain("Hello world");
    expect(detailBody.data.html.toLowerCase()).not.toContain("<script");
    expect(detailBody.data.html).not.toContain("onclick");
  });

  it("requires authentication to list emails", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("https://x/api/emails"), env);
    expect(res.status).toBe(401);
  });
});
