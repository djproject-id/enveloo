# Secure Enveloo — Compose & Send Implementation Plan (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or executing-plans. NOTE (this repo): inline execution preferred; **skip all git/commit steps**.

**Goal:** Let authenticated users compose and send email through Resend, with per-user rate limiting, sender-ownership enforcement (no spoofing), and a stored "sent" copy.

**Architecture:** A pure `sendViaResend(apiKey, input, fetchImpl)` adapter (injectable fetch, unit-tested) does the outbound HTTP call. The `POST /api/emails/send` route enforces `email:send`, verifies the `from` address is an account the user owns, sends, then stores a sanitized "sent" copy in `emails` (a new `direction` column distinguishes received vs sent).

**Tech Stack:** Resend HTTP API; reuses Plan 1–3 (Hono, Drizzle, Zod, rate-limit, sanitizer, RBAC).

**Conventions:** commands from `apps/worker/`; npm; TDD; no commits.

---

## File Structure

```
apps/worker/
├─ src/
│  ├─ db/schema.ts          # MODIFY: add emails.direction
│  ├─ email/send.ts         # NEW: Resend adapter
│  └─ routes/emails.ts      # MODIFY: per-route permissions + POST /send
└─ test/
   ├─ send.test.ts          # NEW
   └─ send.routes.test.ts   # NEW
```

---

## Task 1: Add `direction` column + migration

**Files:** Modify `src/db/schema.ts`; generate migration.

- [ ] **Step 1: Add a `direction` column to the `emails` table in `apps/worker/src/db/schema.ts`**

In the `emails` table definition, add this column (e.g. right after `unread`):

```ts
  direction: text("direction").notNull().default("received"),
```

- [ ] **Step 2: Generate migration**

Run: `npm run db:generate`
Expected: `migrations/0003_*.sql` adding the `direction` column.

- [ ] **Step 3: Commit** — SKIP.

---

## Task 2: Resend send adapter

**Files:** Create `src/email/send.ts`; test `test/send.test.ts`.

- [ ] **Step 1: Write failing test** — `apps/worker/test/send.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { sendViaResend } from "../src/email/send";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("sendViaResend", () => {
  it("returns the message id on success", async () => {
    const r = await sendViaResend(
      "key",
      { from: "a@x.com", to: "b@y.com", subject: "Hi", text: "yo" },
      fakeFetch(200, { id: "msg_123" }),
    );
    expect(r.id).toBe("msg_123");
  });

  it("throws on a non-2xx response", async () => {
    await expect(
      sendViaResend(
        "key",
        { from: "a@x.com", to: "b@y.com", subject: "Hi", text: "yo" },
        fakeFetch(422, { message: "bad" }),
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- send.test`
Expected: cannot find module.

- [ ] **Step 3: Implement** — `apps/worker/src/email/send.ts`

```ts
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendInput {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendResult {
  id: string;
}

export async function sendViaResend(
  apiKey: string,
  input: SendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed with status ${res.status}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- send.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 3: Refactor email routes (per-route permissions) + add `POST /send`

**Files:** Replace `apps/worker/src/routes/emails.ts`.

- [ ] **Step 1: Replace `apps/worker/src/routes/emails.ts`** with:

```ts
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { rateLimit } from "../http/rate-limit";
import { db } from "../db/client";
import {
  emails as emailsTable,
  attachments as attachmentsTable,
  accounts as accountsTable,
} from "../db/schema";
import { requireAuth, requirePermission } from "../http/auth-middleware";
import { sendViaResend } from "../email/send";
import { sanitizeEmailHtml } from "../email/sanitize";

export const emailRoutes = new Hono<{ Bindings: Env }>();

emailRoutes.use("*", requireAuth());

emailRoutes.get("/", requirePermission("email:read"), async (c) => {
  const { userId } = c.get("auth");
  const rows = await db(c.env.DB)
    .select({
      id: emailsTable.id,
      fromAddress: emailsTable.fromAddress,
      fromName: emailsTable.fromName,
      toAddress: emailsTable.toAddress,
      subject: emailsTable.subject,
      unread: emailsTable.unread,
      direction: emailsTable.direction,
      createdAt: emailsTable.createdAt,
    })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(50)
    .all();
  return c.json(ok(rows));
});

const sendSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().max(998),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
});

emailRoutes.post("/send", requirePermission("email:send"), async (c) => {
  const { userId } = c.get("auth");
  const rl = await rateLimit(c.env.KV, `send:${userId}`, 20, 3600);
  if (!rl.allowed) throw new AppError("Too many sends", 429, "RATE_LIMIT");

  const body = await validateJson(c, sendSchema);
  if (!body.html && !body.text) throw new AppError("Empty body", 400, "EMPTY_BODY");

  const d = db(c.env.DB);
  const account = await d
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, body.from.toLowerCase()))
    .get();
  if (!account || account.userId !== userId) {
    throw new AppError("You do not own this sender address", 403, "FORBIDDEN");
  }

  const result = await sendViaResend(c.env.RESEND_API_KEY, {
    from: body.from,
    to: body.to,
    subject: body.subject,
    html: body.html,
    text: body.text,
  });

  const safeHtml = body.html ? await sanitizeEmailHtml(body.html) : "";
  await d
    .insert(emailsTable)
    .values({
      accountId: account.id,
      userId,
      fromAddress: body.from,
      fromName: "",
      toAddress: body.to,
      subject: body.subject,
      html: safeHtml,
      text: body.text ?? "",
      unread: 0,
      direction: "sent",
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run();

  return c.json(ok({ id: result.id }));
});

emailRoutes.get("/:id", requirePermission("email:read"), async (c) => {
  const id = Number(c.req.param("id"));
  const { userId, adm } = c.get("auth");
  const d = db(c.env.DB);
  const row = await d.select().from(emailsTable).where(eq(emailsTable.id, id)).get();
  if (!row || (row.userId !== userId && !adm)) throw new AppError("Not found", 404, "NOT_FOUND");
  if (row.unread === 1) {
    await d.update(emailsTable).set({ unread: 0 }).where(eq(emailsTable.id, id)).run();
  }
  return c.json(ok(row));
});

emailRoutes.get("/:id/attachments/:attId", requirePermission("email:read"), async (c) => {
  const id = Number(c.req.param("id"));
  const attId = Number(c.req.param("attId"));
  const { userId, adm } = c.get("auth");
  const att = await db(c.env.DB)
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, attId))
    .get();
  if (!att || att.emailId !== id || (att.userId !== userId && !adm)) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }
  const obj = await c.env.R2.get(att.r2Key);
  if (!obj) throw new AppError("Not found", 404, "NOT_FOUND");
  const safeName = att.filename.replace(/["\r\n]/g, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** — SKIP.

---

## Task 4: Integration test — send flow

**Files:** Create `test/send.routes.test.ts`.

- [ ] **Step 1: Write the test** — `apps/worker/test/send.routes.test.ts`

```ts
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
  for (const t of ["attachments", "emails", "accounts", "users", "invite_keys", "role_permissions", "permissions", "roles"]) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }
  const d = db(env.DB);
  await seedRbac(d);
  await d.insert(inviteKeys).values({ code: "GOLDEN", maxUses: 5, uses: 0, roleId: 0, createdAt: 0 }).run();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "msg_abc" }), { status: 200, headers: { "content-type": "application/json" } });
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
```

- [ ] **Step 2: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests PASS (Plans 1–4).
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** — SKIP.

---

## Done criteria for Plan 4
- `npm test` green for: `sendViaResend` unit tests and the send integration flow (owned-address send + sent copy stored; non-owned address rejected), plus all prior tests.
- `npm run typecheck` clean.
- Sending requires auth + `email:send` + per-user rate limit; the `from` address must be owned by the user (anti-spoof); a sanitized sent copy is persisted with `direction = "sent"`.
- No secrets committed; no git commits.

## Backend MVP complete after this plan
The secure backend MVP (foundation, auth/RBAC, receive/read, compose/send) is done.
Remaining for a full product: the Vue web app (login UI, inbox, reader with sandboxed
iframe, composer), account-management API/UI, and a production deployment pass
(`wrangler secret put`, real D1/KV/R2 IDs, Email Routing + Resend domain verification).
```
