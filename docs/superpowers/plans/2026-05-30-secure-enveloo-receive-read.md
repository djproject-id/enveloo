# Secure Enveloo — Receive & Read Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or executing-plans. NOTE (this repo): inline execution preferred; **skip all git/commit steps** (git not initialized).

**Goal:** Receive inbound email via Cloudflare Email Routing, parse it, **sanitize the HTML**, store it (with attachments in R2 under randomized keys), and expose authenticated read APIs.

**Architecture:** A pure `ingestEmail(env, recipient, raw)` core (unit-testable) does parse → sanitize → persist. The Worker `email()` handler is a thin adapter over it. HTML is sanitized at ingest using the Workers-native `HTMLRewriter` (zero dependencies); the frontend will additionally render bodies inside a sandboxed iframe (defense-in-depth, built with the web app). Attachments are forced to download (`Content-Disposition: attachment`, `nosniff`, generic content-type).

**Tech Stack:** Adds `postal-mime` (MIME parsing). Uses HTMLRewriter, R2, D1/Drizzle, the Plan 2 auth/RBAC.

**Conventions:** commands from `apps/worker/`; npm; TDD; no commits.

---

## File Structure

```
apps/worker/
├─ package.json                 # MODIFY: add postal-mime
├─ src/
│  ├─ db/schema.ts              # MODIFY: add accounts, emails, attachments
│  ├─ email/
│  │  ├─ sanitize.ts            # NEW: HTMLRewriter sanitizer
│  │  ├─ parse.ts               # NEW: postal-mime wrapper
│  │  └─ receive.ts             # NEW: ingestEmail + attachment storage
│  ├─ routes/emails.ts          # NEW: read APIs
│  ├─ app.ts                    # MODIFY: mount /api/emails
│  └─ index.ts                  # MODIFY: add email() handler
└─ test/
   ├─ sanitize.test.ts          # NEW
   ├─ parse.test.ts             # NEW
   ├─ receive.test.ts           # NEW
   └─ emails.routes.test.ts     # NEW
```

---

## Task 1: Add dependency + schema + migration

**Files:** Modify `package.json`, `src/db/schema.ts`; generate migration.

- [ ] **Step 1: Add `postal-mime` to dependencies in `apps/worker/package.json`**

Add `"postal-mime": "^2.4.3"` to the `dependencies` object (keep the others).

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `postal-mime` added.

- [ ] **Step 3: Append tables to `apps/worker/src/db/schema.ts`**

```ts
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  userId: integer("user_id").notNull(),
  fromAddress: text("from_address").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  toAddress: text("to_address").notNull().default(""),
  subject: text("subject").notNull().default(""),
  html: text("html").notNull().default(""),
  text: text("text").notNull().default(""),
  unread: integer("unread").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id").notNull(),
  userId: integer("user_id").notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull().default("attachment"),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
```

- [ ] **Step 4: Generate migration**

Run: `npm run db:generate`
Expected: `migrations/0002_*.sql` creating accounts, emails, attachments.

- [ ] **Step 5: Commit** — SKIP.

---

## Task 2: HTML sanitizer (HTMLRewriter)

**Files:** Create `src/email/sanitize.ts`; test `test/sanitize.test.ts`.

- [ ] **Step 1: Write failing test** — `apps/worker/test/sanitize.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { sanitizeEmailHtml } from "../src/email/sanitize";

describe("sanitizeEmailHtml", () => {
  it("removes script tags and their content", async () => {
    const out = await sanitizeEmailHtml(`<p>hi</p><script>alert(1)</script>`);
    expect(out).toContain("hi");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips inline event handlers", async () => {
    const out = await sanitizeEmailHtml(`<p onclick="evil()">x</p>`);
    expect(out).not.toContain("onclick");
    expect(out).toContain("x");
  });

  it("strips javascript: URLs", async () => {
    const out = await sanitizeEmailHtml(`<a href="javascript:evil()">l</a>`);
    expect(out.toLowerCase()).not.toContain("javascript:");
  });

  it("removes iframes and forms", async () => {
    const out = await sanitizeEmailHtml(`<iframe src="x"></iframe><form action="y"></form>ok`);
    expect(out.toLowerCase()).not.toContain("<iframe");
    expect(out.toLowerCase()).not.toContain("<form");
    expect(out).toContain("ok");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- sanitize`
Expected: cannot find module.

- [ ] **Step 3: Implement** — `apps/worker/src/email/sanitize.ts`

```ts
const DROP_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "style",
] as const;

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "background"]);

export async function sanitizeEmailHtml(html: string): Promise<string> {
  let rewriter = new HTMLRewriter();

  for (const tag of DROP_TAGS) {
    rewriter = rewriter.on(tag, {
      element(el) {
        el.remove();
      },
    });
  }

  rewriter = rewriter.on("*", {
    element(el) {
      const toRemove: string[] = [];
      for (const [name, value] of el.attributes) {
        const n = name.toLowerCase();
        if (n.startsWith("on")) {
          toRemove.push(name);
        } else if (URL_ATTRS.has(n) && /^\s*javascript:/i.test(value)) {
          toRemove.push(name);
        }
      }
      for (const a of toRemove) el.removeAttribute(a);
    },
  });

  const transformed = rewriter.transform(new Response(html));
  return await transformed.text();
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- sanitize`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 3: Email parse service (postal-mime)

**Files:** Create `src/email/parse.ts`; test `test/parse.test.ts`.

- [ ] **Step 1: Write failing test** — `apps/worker/test/parse.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseEmail } from "../src/email/parse";

const RAW = [
  "From: Alice <alice@example.com>",
  "To: inbox@mydomain.com",
  "Subject: Hello",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Hi there</p>",
  "--b1",
  "Content-Type: text/plain; name=\"note.txt\"",
  'Content-Disposition: attachment; filename="note.txt"',
  "",
  "hello attachment",
  "--b1--",
  "",
].join("\r\n");

describe("parseEmail", () => {
  it("extracts headers, html body, and attachments", async () => {
    const p = await parseEmail(RAW);
    expect(p.fromAddress).toBe("alice@example.com");
    expect(p.toAddress).toBe("inbox@mydomain.com");
    expect(p.subject).toBe("Hello");
    expect(p.html).toContain("Hi there");
    expect(p.attachments.length).toBe(1);
    expect(p.attachments[0]!.filename).toBe("note.txt");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- parse`
Expected: cannot find module.

- [ ] **Step 3: Implement** — `apps/worker/src/email/parse.ts`

```ts
import PostalMime from "postal-mime";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer;
}

export interface ParsedEmail {
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  html: string;
  text: string;
  attachments: ParsedAttachment[];
}

function toArrayBuffer(content: ArrayBuffer | string): ArrayBuffer {
  if (typeof content === "string") {
    return new TextEncoder().encode(content).buffer as ArrayBuffer;
  }
  return content;
}

export async function parseEmail(raw: ArrayBuffer | string): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  return {
    fromAddress: email.from?.address ?? "",
    fromName: email.from?.name ?? "",
    toAddress: email.to?.[0]?.address ?? "",
    subject: email.subject ?? "",
    html: email.html ?? "",
    text: email.text ?? "",
    attachments: (email.attachments ?? []).map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.mimeType ?? "application/octet-stream",
      content: toArrayBuffer(a.content),
    })),
  };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- parse`
Expected: PASS. If `toAddress` is empty, postal-mime may expose recipients differently — fall back to `email.to?.[0]?.address`; the ingest path uses the routing recipient anyway, so this field is informational.

- [ ] **Step 5: Commit** — SKIP.

---

## Task 4: Ingest service + attachment storage

**Files:** Create `src/email/receive.ts`; test `test/receive.test.ts`.

- [ ] **Step 1: Write failing test** — `apps/worker/test/receive.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ingestEmail } from "../src/email/receive";
import { db } from "../src/db/client";
import { accounts, emails, attachments } from "../src/db/schema";
import { eq } from "drizzle-orm";

const RAW = [
  "From: Bob <bob@example.com>",
  "To: inbox@mydomain.com",
  "Subject: Test",
  "MIME-Version: 1.0",
  'Content-Type: text/html; charset=utf-8',
  "",
  '<p onclick="x()">Body<script>alert(1)</script></p>',
  "",
].join("\r\n");

beforeEach(async () => {
  await env.DB.exec("DELETE FROM attachments");
  await env.DB.exec("DELETE FROM emails");
  await env.DB.exec("DELETE FROM accounts");
});

describe("ingestEmail", () => {
  it("stores a sanitized email for a known recipient", async () => {
    const d = db(env.DB);
    await d.insert(accounts).values({ email: "inbox@mydomain.com", userId: 1, createdAt: 0 }).run();

    const stored = await ingestEmail(env, "inbox@mydomain.com", RAW);
    expect(stored).toBe(true);

    const row = await d.select().from(emails).where(eq(emails.userId, 1)).get();
    expect(row?.subject).toBe("Test");
    expect(row?.html).toContain("Body");
    expect(row?.html.toLowerCase()).not.toContain("<script");
    expect(row?.html).not.toContain("onclick");
  });

  it("drops mail for an unknown recipient", async () => {
    const stored = await ingestEmail(env, "nobody@mydomain.com", RAW);
    expect(stored).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- receive`
Expected: cannot find module.

- [ ] **Step 3: Implement** — `apps/worker/src/email/receive.ts`

```ts
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { db } from "../db/client";
import { accounts, emails, attachments } from "../db/schema";
import { parseEmail } from "./parse";
import { sanitizeEmailHtml } from "./sanitize";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

async function storeAttachment(r2: R2Bucket, data: ArrayBuffer, mimeType: string): Promise<string> {
  const key = `att/${crypto.randomUUID()}`;
  await r2.put(key, data, { httpMetadata: { contentType: mimeType } });
  return key;
}

export async function ingestEmail(
  env: Env,
  recipient: string,
  raw: ArrayBuffer | string,
): Promise<boolean> {
  const to = recipient.toLowerCase();
  const d = db(env.DB);
  const account = await d.select().from(accounts).where(eq(accounts.email, to)).get();
  if (!account) return false;

  const parsed = await parseEmail(raw);
  const safeHtml = parsed.html ? await sanitizeEmailHtml(parsed.html) : "";
  const now = Math.floor(Date.now() / 1000);

  const inserted = await d
    .insert(emails)
    .values({
      accountId: account.id,
      userId: account.userId,
      fromAddress: parsed.fromAddress,
      fromName: parsed.fromName,
      toAddress: to,
      subject: parsed.subject,
      html: safeHtml,
      text: parsed.text,
      unread: 1,
      createdAt: now,
    })
    .returning({ id: emails.id });

  const emailId = inserted[0]!.id;

  for (const att of parsed.attachments) {
    if (att.content.byteLength > MAX_ATTACHMENT_BYTES) continue;
    const key = await storeAttachment(env.R2, att.content, att.mimeType);
    await d
      .insert(attachments)
      .values({
        emailId,
        userId: account.userId,
        r2Key: key,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.content.byteLength,
        createdAt: now,
      })
      .run();
  }
  return true;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- receive`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 5: Read routes + mount + email() handler

**Files:** Create `src/routes/emails.ts`; modify `src/app.ts`, `src/index.ts`.

- [ ] **Step 1: Implement** — `apps/worker/src/routes/emails.ts`

```ts
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { db } from "../db/client";
import { emails as emailsTable, attachments as attachmentsTable } from "../db/schema";
import { requireAuth, requirePermission } from "../http/auth-middleware";

export const emailRoutes = new Hono<{ Bindings: Env }>();

emailRoutes.use("*", requireAuth(), requirePermission("email:read"));

emailRoutes.get("/", async (c) => {
  const { userId } = c.get("auth");
  const rows = await db(c.env.DB)
    .select({
      id: emailsTable.id,
      fromAddress: emailsTable.fromAddress,
      fromName: emailsTable.fromName,
      subject: emailsTable.subject,
      unread: emailsTable.unread,
      createdAt: emailsTable.createdAt,
    })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(50)
    .all();
  return c.json(ok(rows));
});

emailRoutes.get("/:id", async (c) => {
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

emailRoutes.get("/:id/attachments/:attId", async (c) => {
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

- [ ] **Step 2: Mount in `apps/worker/src/app.ts`**

Add the import and the route mount alongside the others:

```ts
import { emailRoutes } from "./routes/emails";
```
and inside `createApp()`, after `app.route("/api/auth", auth);` add:
```ts
  app.route("/api/emails", emailRoutes);
```

- [ ] **Step 3: Add the `email()` handler in `apps/worker/src/index.ts`**

Replace the file with:

```ts
import { createApp } from "./app";
import type { Env } from "./env";
import { ingestEmail } from "./email/receive";

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    await ingestEmail(env, message.to, raw);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit** — SKIP.

---

## Task 6: Integration test — receive then read

**Files:** Create `test/emails.routes.test.ts`.

- [ ] **Step 1: Write the integration test** — `apps/worker/test/emails.routes.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { accounts, inviteKeys } from "../src/db/schema";
import { ingestEmail } from "../src/email/receive";
import { eq } from "drizzle-orm";
import { users } from "../src/db/schema";

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
  for (const t of ["attachments", "emails", "accounts", "users", "invite_keys", "role_permissions", "permissions", "roles"]) {
    await env.DB.exec(`DELETE FROM ${t}`);
  }
  const d = db(env.DB);
  await seedRbac(d);
  await d.insert(inviteKeys).values({ code: "GOLDEN", maxUses: 5, uses: 0, roleId: 0, createdAt: 0 }).run();
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

    // Register + login a user.
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
    await d.insert(accounts).values({ email: "inbox@mydomain.com", userId: user!.id, createdAt: 0 }).run();

    // Receive an email for that account.
    const stored = await ingestEmail(env, "inbox@mydomain.com", RAW);
    expect(stored).toBe(true);

    // List.
    const list = await app.fetch(new Request("https://x/api/emails", { headers: { cookie } }), env);
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data.length).toBe(1);
    const emailId = listBody.data[0].id;

    // Read detail — sanitized.
    const detail = await app.fetch(
      new Request(`https://x/api/emails/${emailId}`, { headers: { cookie } }),
      env,
    );
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
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
```

- [ ] **Step 2: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests PASS (Plan 1 + 2 + 3).
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** — SKIP.

---

## Done criteria for Plan 3
- `npm test` green for: sanitize, parse, receive, and the receive→read integration flow, plus all prior tests.
- `npm run typecheck` clean.
- Inbound mail to a known account is parsed, HTML-sanitized (script/iframe/form/event-handler/`javascript:` stripped), and stored; attachments saved to R2 under randomized keys with a size cap.
- Read APIs enforce auth + `email:read` and ownership; attachments are forced to download with `nosniff`.
- No secrets committed; no git commits.

## Notes carried forward
- Sanitization is denylist-based via HTMLRewriter; primary XSS containment is the
  sandboxed iframe on the (future) web frontend. A later hardening pass may add an
  allowlist sanitizer for belt-and-suspenders.
- Account creation (the address-management UI/API) is minimal here (rows inserted
  directly in tests); a full `account:manage` API arrives with the web app / Plan 4.
- Recipient resolution is exact-match on `accounts.email`; catch-all routing is a later feature.
```
