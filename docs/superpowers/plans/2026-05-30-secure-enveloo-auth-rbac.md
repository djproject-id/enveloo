# Secure Enveloo — Auth & RBAC Implementation Plan (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. NOTE (this repo): inline execution is preferred over long-running subagents.

**Goal:** Add secure, invite-only authentication (PBKDF2 passwords, HS256 JWT access+refresh in HttpOnly cookies, KV session allowlist) and deny-by-default RBAC on top of the Plan 1 foundation.

**Architecture:** Auth primitives live in `src/auth/` (pure, unit-tested). HTTP concerns (endpoints, middleware, cookies) live in `src/routes/auth.ts` and `src/http/`. RBAC uses `users.role_id → role_permissions → permissions`, with the operator's `ADMIN_EMAIL` short-circuiting permission checks via an `adm` JWT claim.

**Tech Stack:** Same as Plan 1. Adds: WebCrypto PBKDF2/HMAC, Hono cookie helpers, D1 migration applied in tests via `@cloudflare/vitest-pool-workers` `readD1Migrations`/`applyD1Migrations`.

**Conventions:**
- All commands from `apps/worker/`. Package manager `npm`. TDD throughout.
- **Do NOT run `git`/commit** (git not initialized yet in this repo). Skip all commit steps.
- Token lifetimes: access = 900s (15 min), refresh = 604800s (7 days).

---

## File Structure (built/modified by this plan)

```
apps/worker/
├─ vitest.config.ts            # MODIFY: read+inject D1 migrations
├─ test/
│  ├─ apply-migrations.ts      # NEW: setup file, applies migrations to test D1
│  ├─ env.d.ts                 # NEW: types for cloudflare:test ProvidedEnv
│  ├─ password.test.ts         # NEW
│  ├─ jwt.test.ts              # NEW
│  ├─ rbac.test.ts             # NEW
│  ├─ session.test.ts          # NEW
│  ├─ rate-limit.test.ts       # NEW
│  ├─ turnstile.test.ts        # NEW
│  ├─ cookies.test.ts          # NEW
│  └─ auth.routes.test.ts      # NEW (register/login/logout/refresh + middleware)
├─ src/
│  ├─ env.ts                   # MODIFY: add TEST_MIGRATIONS? (test-only, via env.d.ts instead)
│  ├─ db/schema.ts             # MODIFY: add users, roles, permissions, role_permissions, invite_keys
│  ├─ auth/
│  │  ├─ password.ts           # NEW: PBKDF2 hash/verify
│  │  ├─ jwt.ts                # NEW: HS256 sign/verify
│  │  ├─ session.ts            # NEW: KV session allowlist
│  │  └─ rbac.ts               # NEW: seed + permission lookup
│  ├─ http/
│  │  ├─ rate-limit.ts         # NEW: KV fixed-window limiter
│  │  ├─ turnstile.ts          # NEW: Turnstile verifier (injectable fetch)
│  │  ├─ cookies.ts            # NEW: auth cookie set/clear
│  │  └─ auth-middleware.ts    # NEW: requireAuth + requirePermission
│  └─ routes/
│     └─ auth.ts               # NEW: /register /login /logout /refresh /me
└─ migrations/                 # NEW migration generated for the new tables
```

---

## Task 1: Password hashing (PBKDF2)

**Files:**
- Create: `apps/worker/src/auth/password.ts`
- Test: `apps/worker/test/password.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/worker/test/password.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- password`
Expected: FAIL — cannot find module `../src/auth/password`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/auth/password.ts`

```ts
const ITERATIONS = 210_000;
const KEY_BYTES = 32;
const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { hash: toB64(hash), salt: toB64(salt) };
}

export async function verifyPassword(
  password: string,
  saltB64: string,
  hashB64: string,
): Promise<boolean> {
  const computed = await pbkdf2(password, fromB64(saltB64));
  return timingSafeEqual(computed, fromB64(hashB64));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- password`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — SKIP (no git).

---

## Task 2: JWT sign/verify (HS256)

**Files:**
- Create: `apps/worker/src/auth/jwt.ts`
- Test: `apps/worker/test/jwt.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/worker/test/jwt.test.ts`

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- jwt`
Expected: FAIL — cannot find module `../src/auth/jwt`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/auth/jwt.ts`

```ts
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlToBytes(s: string): Uint8Array {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
}

export async function signJwt(
  secret: string,
  payload: Record<string, unknown>,
  ttlSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })));
  const data = `${header}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyJwt(
  secret: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts as [string, string, string];
  const data = `${header}.${body}`;
  let valid = false;
  try {
    valid = await crypto.subtle.verify("HMAC", await hmacKey(secret, ["verify"]), b64urlToBytes(sig), enc.encode(data));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlToBytes(body))) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- jwt`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 3: DB schema + migration + test migration harness

**Files:**
- Modify: `apps/worker/src/db/schema.ts`
- Create: `apps/worker/test/env.d.ts`
- Modify: `apps/worker/vitest.config.ts`
- Create: `apps/worker/test/apply-migrations.ts`
- Generate: new file under `apps/worker/migrations/`

- [ ] **Step 1: Append tables to `apps/worker/src/db/schema.ts`**

```ts
export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isDefault: integer("is_default").notNull().default(0),
});

export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
});

export const rolePermissions = sqliteTable("role_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull(),
  permissionId: integer("permission_id").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  roleId: integer("role_id").notNull(),
  status: integer("status").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const inviteKeys = sqliteTable("invite_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  roleId: integer("role_id").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `migrations/0001_*.sql` creating the 5 tables.

- [ ] **Step 3: Create `apps/worker/test/env.d.ts`** (types for the injected migrations binding)

```ts
import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    KV: KVNamespace;
    R2: R2Bucket;
    JWT_SECRET: string;
    RESEND_API_KEY: string;
    TURNSTILE_SECRET: string;
    ADMIN_EMAIL: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
```

- [ ] **Step 4: Replace `apps/worker/vitest.config.ts`** (read migrations and inject them)

```ts
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            JWT_SECRET: "test-secret",
            RESEND_API_KEY: "test-resend",
            TURNSTILE_SECRET: "test-turnstile",
            ADMIN_EMAIL: "admin@example.com",
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
```

- [ ] **Step 5: Create `apps/worker/test/apply-migrations.ts`**

```ts
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 6: Verify existing suite still green**

Run: `npm test`
Expected: all prior tests still PASS (the health test's `SELECT 1` is unaffected; migrations now applied in test DB).
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit** — SKIP.

---

## Task 4: RBAC seed + permission lookup

**Files:**
- Create: `apps/worker/src/auth/rbac.ts`
- Test: `apps/worker/test/rbac.test.ts`

Permission catalog for v1 (grows in later plans): `email:read`, `email:send`, `account:manage`.

- [ ] **Step 1: Write the failing test** — `apps/worker/test/rbac.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { db } from "../src/db/client";
import { seedRbac, defaultRoleId, userPermissions } from "../src/auth/rbac";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM role_permissions; DELETE FROM permissions; DELETE FROM roles;");
});

describe("rbac", () => {
  it("seeds a default role with base permissions (idempotent)", async () => {
    const d = db(env.DB);
    await seedRbac(d);
    await seedRbac(d); // second call must not duplicate
    const roleId = await defaultRoleId(d);
    expect(roleId).toBeGreaterThan(0);
    const perms = await userPermissions(d, roleId);
    expect(perms.sort()).toEqual(["account:manage", "email:read", "email:send"]);
  });

  it("returns no permissions for an unknown role", async () => {
    const d = db(env.DB);
    await seedRbac(d);
    expect(await userPermissions(d, 9999)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rbac`
Expected: FAIL — cannot find module `../src/auth/rbac`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/auth/rbac.ts`

```ts
import { eq } from "drizzle-orm";
import type { db as makeDb } from "../db/client";
import { roles, permissions, rolePermissions } from "../db/schema";

type DB = ReturnType<typeof makeDb>;

export const BASE_PERMISSIONS = ["email:read", "email:send", "account:manage"] as const;

export async function seedRbac(d: DB): Promise<void> {
  let role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  if (!role) {
    await d.insert(roles).values({ name: "user", isDefault: 1 }).run();
    role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  }
  const roleId = role!.id;

  for (const key of BASE_PERMISSIONS) {
    let perm = await d.select().from(permissions).where(eq(permissions.key, key)).get();
    if (!perm) {
      await d.insert(permissions).values({ key }).run();
      perm = await d.select().from(permissions).where(eq(permissions.key, key)).get();
    }
    const link = await d
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, perm!.id))
      .get();
    if (!link) {
      await d.insert(rolePermissions).values({ roleId, permissionId: perm!.id }).run();
    }
  }
}

export async function defaultRoleId(d: DB): Promise<number> {
  const role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  return role?.id ?? 0;
}

export async function userPermissions(d: DB, roleId: number): Promise<string[]> {
  const rows = await d
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId))
    .all();
  return rows.map((r) => r.key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rbac`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 5: Session store (KV allowlist)

**Files:**
- Create: `apps/worker/src/auth/session.ts`
- Test: `apps/worker/test/session.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/worker/test/session.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createSession, getSession, revokeSession } from "../src/auth/session";

describe("session store", () => {
  it("creates, reads, and revokes a session", async () => {
    await createSession(env.KV, 5, "sid-1", 3600);
    const s = await getSession(env.KV, 5, "sid-1");
    expect(s?.userId).toBe(5);
    await revokeSession(env.KV, 5, "sid-1");
    expect(await getSession(env.KV, 5, "sid-1")).toBeNull();
  });

  it("returns null for an unknown session", async () => {
    expect(await getSession(env.KV, 1, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session`
Expected: FAIL — cannot find module `../src/auth/session`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/auth/session.ts`

```ts
export interface Session {
  userId: number;
  createdAt: number;
}

function sessionKey(userId: number, sid: string): string {
  return `session:${userId}:${sid}`;
}

export async function createSession(
  kv: KVNamespace,
  userId: number,
  sid: string,
  ttlSeconds: number,
): Promise<void> {
  const value: Session = { userId, createdAt: Math.floor(Date.now() / 1000) };
  await kv.put(sessionKey(userId, sid), JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function getSession(
  kv: KVNamespace,
  userId: number,
  sid: string,
): Promise<Session | null> {
  return await kv.get<Session>(sessionKey(userId, sid), "json");
}

export async function revokeSession(kv: KVNamespace, userId: number, sid: string): Promise<void> {
  await kv.delete(sessionKey(userId, sid));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 6: Rate limiter (KV fixed window)

**Files:**
- Create: `apps/worker/src/http/rate-limit.ts`
- Test: `apps/worker/test/rate-limit.test.ts`

> Note: KV `expirationTtl` minimum is 60s, so `windowSeconds` must be ≥ 60. This is a
> simple fixed-window counter (TTL refreshes on each increment — acceptable for v1
> abuse-prevention; documented as a known limitation).

- [ ] **Step 1: Write the failing test** — `apps/worker/test/rate-limit.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { rateLimit } from "../src/http/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", async () => {
    const key = "test-ip-1";
    const r1 = await rateLimit(env.KV, key, 2, 60);
    const r2 = await rateLimit(env.KV, key, 2, 60);
    const r3 = await rateLimit(env.KV, key, 2, 60);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- rate-limit`
Expected: FAIL — cannot find module `../src/http/rate-limit`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/http/rate-limit.ts`

```ts
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  const current = Number((await kv.get(k)) ?? "0");
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(k, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: limit - current - 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- rate-limit`
Expected: PASS.

- [ ] **Step 5: Commit** — SKIP.

---

## Task 7: Turnstile verifier (injectable fetch)

**Files:**
- Create: `apps/worker/src/http/turnstile.ts`
- Test: `apps/worker/test/turnstile.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/worker/test/turnstile.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { verifyTurnstile } from "../src/http/turnstile";

function fakeFetch(body: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("verifyTurnstile", () => {
  it("returns true when siteverify succeeds", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({ success: true }))).toBe(true);
  });
  it("returns false when siteverify fails", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({ success: false }))).toBe(false);
  });
  it("returns false on a non-200 response", async () => {
    expect(await verifyTurnstile("secret", "token", fakeFetch({}, false))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- turnstile`
Expected: FAIL — cannot find module `../src/http/turnstile`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/http/turnstile.ts`

```ts
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  secret: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  let res: Response;
  try {
    res = await fetchImpl(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- turnstile`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 8: Auth cookies helper

**Files:**
- Create: `apps/worker/src/http/cookies.ts`
- Test: `apps/worker/test/cookies.test.ts`

- [ ] **Step 1: Write the failing test** — `apps/worker/test/cookies.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { setAuthCookies, clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE } from "../src/http/cookies";

describe("auth cookies", () => {
  it("sets HttpOnly, Secure, SameSite=Strict access and refresh cookies", async () => {
    const app = new Hono();
    app.get("/x", (c) => {
      setAuthCookies(c, "acc", "ref");
      return c.text("ok");
    });
    const res = await app.request("/x");
    const cookies = res.headers.getSetCookie();
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
    const cookies = res.headers.getSetCookie().join("\n");
    expect(cookies).toContain(`${ACCESS_COOKIE}=`);
    expect(cookies).toContain("Max-Age=0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cookies`
Expected: FAIL — cannot find module `../src/http/cookies`.

- [ ] **Step 3: Write minimal implementation** — `apps/worker/src/http/cookies.ts`

```ts
import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const ACCESS_TTL = 900;
export const REFRESH_TTL = 604800;

export function setAuthCookies(c: Context, access: string, refresh: string): void {
  setCookie(c, ACCESS_COOKIE, access, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: ACCESS_TTL,
  });
  setCookie(c, REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: REFRESH_TTL,
  });
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/auth" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cookies`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit** — SKIP.

---

## Task 9: Auth middleware (requireAuth + requirePermission)

**Files:**
- Create: `apps/worker/src/http/auth-middleware.ts`
- Test: covered by `apps/worker/test/auth.routes.test.ts` in Task 11 (middleware is exercised through the protected `/api/auth/me` route).

- [ ] **Step 1: Write implementation** — `apps/worker/src/http/auth-middleware.ts`

```ts
import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Env } from "../env";
import { AppError } from "./errors";
import { verifyJwt } from "../auth/jwt";
import { getSession } from "../auth/session";
import { db } from "../db/client";
import { userPermissions } from "../auth/rbac";
import { ACCESS_COOKIE } from "./cookies";

export interface AuthContext {
  userId: number;
  sid: string;
  adm: boolean;
  roleId: number;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function requireAuth() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const token = getCookie(c, ACCESS_COOKIE);
    if (!token) throw new AppError("Not authenticated", 401, "AUTH");

    const payload = await verifyJwt(c.env.JWT_SECRET, token);
    if (!payload) throw new AppError("Invalid token", 401, "AUTH");

    const userId = Number(payload.sub);
    const sid = String(payload.sid ?? "");
    const session = await getSession(c.env.KV, userId, sid);
    if (!session) throw new AppError("Session revoked", 401, "AUTH");

    c.set("auth", {
      userId,
      sid,
      adm: payload.adm === true,
      roleId: Number(payload.role ?? 0),
    });
    await next();
  });
}

export function requirePermission(permission: string) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) throw new AppError("Not authenticated", 401, "AUTH");
    if (auth.adm) return await next(); // admin bypass
    const perms = await userPermissions(db(c.env.DB), auth.roleId);
    if (!perms.includes(permission)) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    await next();
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (full behavior verified in Task 11).

- [ ] **Step 3: Commit** — SKIP.

---

## Task 10: Auth routes — register, login, logout, refresh, me

**Files:**
- Create: `apps/worker/src/routes/auth.ts`

- [ ] **Step 1: Write implementation** — `apps/worker/src/routes/auth.ts`

```ts
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { rateLimit } from "../http/rate-limit";
import { verifyTurnstile } from "../http/turnstile";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE, ACCESS_TTL, REFRESH_TTL } from "../http/cookies";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt, verifyJwt } from "../auth/jwt";
import { createSession, revokeSession, getSession } from "../auth/session";
import { db } from "../db/client";
import { users, inviteKeys } from "../db/schema";
import { defaultRoleId } from "../auth/rbac";
import { requireAuth } from "../http/auth-middleware";

export const auth = new Hono<{ Bindings: Env }>();

const credsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  turnstileToken: z.string().min(1).max(4000),
});
const registerSchema = credsSchema.extend({ inviteCode: z.string().min(1).max(200) });

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? "0.0.0.0";
}

async function issueTokens(c: { env: Env }, userId: number, isAdmin: boolean, roleId: number) {
  const sid = crypto.randomUUID();
  await createSession(c.env.KV, userId, sid, REFRESH_TTL);
  const access = await signJwt(c.env.JWT_SECRET, { sub: userId, sid, adm: isAdmin, role: roleId }, ACCESS_TTL);
  const refresh = await signJwt(c.env.JWT_SECRET, { sub: userId, sid, typ: "refresh" }, REFRESH_TTL);
  return { access, refresh };
}

auth.post("/register", async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env.KV, `register:${ip}`, 5, 3600);
  if (!rl.allowed) throw new AppError("Too many attempts", 429, "RATE_LIMIT");

  const body = await validateJson(c, registerSchema);
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken))) {
    throw new AppError("Captcha failed", 400, "CAPTCHA");
  }

  const d = db(c.env.DB);
  const invite = await d.select().from(inviteKeys).where(eq(inviteKeys.code, body.inviteCode)).get();
  if (!invite || invite.uses >= invite.maxUses) {
    throw new AppError("Invalid invite code", 400, "INVITE");
  }

  const existing = await d.select().from(users).where(eq(users.email, body.email)).get();
  if (existing) throw new AppError("Email already registered", 409, "EMAIL_TAKEN");

  const { hash, salt } = await hashPassword(body.password);
  const roleId = invite.roleId > 0 ? invite.roleId : await defaultRoleId(d);
  await d.insert(users).values({
    email: body.email,
    passwordHash: hash,
    passwordSalt: salt,
    roleId,
    status: 1,
    createdAt: Math.floor(Date.now() / 1000),
  }).run();
  await d.update(inviteKeys).set({ uses: invite.uses + 1 }).where(eq(inviteKeys.id, invite.id)).run();

  return c.json(ok({ registered: true }), 201);
});

auth.post("/login", async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env.KV, `login:${ip}`, 10, 900);
  if (!rl.allowed) throw new AppError("Too many attempts", 429, "RATE_LIMIT");

  const body = await validateJson(c, credsSchema);
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken))) {
    throw new AppError("Captcha failed", 400, "CAPTCHA");
  }

  const d = db(c.env.DB);
  const user = await d.select().from(users).where(eq(users.email, body.email)).get();
  // Always run a verify to reduce user-enumeration timing differences.
  const valid = user
    ? await verifyPassword(body.password, user.passwordSalt, user.passwordHash)
    : await verifyPassword(body.password, "AAAAAAAAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!user || !valid || user.status !== 1) {
    throw new AppError("Invalid credentials", 401, "AUTH");
  }

  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const { access, refresh } = await issueTokens(c, user.id, isAdmin, user.roleId);
  setAuthCookies(c, access, refresh);
  return c.json(ok({ userId: user.id, admin: isAdmin }));
});

auth.post("/refresh", async (c) => {
  const token = getCookie(c, REFRESH_COOKIE);
  if (!token) throw new AppError("Not authenticated", 401, "AUTH");
  const payload = await verifyJwt(c.env.JWT_SECRET, token);
  if (!payload || payload.typ !== "refresh") throw new AppError("Invalid token", 401, "AUTH");

  const userId = Number(payload.sub);
  const sid = String(payload.sid ?? "");
  const session = await getSession(c.env.KV, userId, sid);
  if (!session) throw new AppError("Session revoked", 401, "AUTH");

  const d = db(c.env.DB);
  const user = await d.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status !== 1) throw new AppError("Invalid user", 401, "AUTH");

  // Rotate: revoke old sid, issue fresh tokens (new sid).
  await revokeSession(c.env.KV, userId, sid);
  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const { access, refresh } = await issueTokens(c, user.id, isAdmin, user.roleId);
  setAuthCookies(c, access, refresh);
  return c.json(ok({ refreshed: true }));
});

auth.post("/logout", requireAuth(), async (c) => {
  const { userId, sid } = c.get("auth");
  await revokeSession(c.env.KV, userId, sid);
  clearAuthCookies(c);
  return c.json(ok({ loggedOut: true }));
});

auth.get("/me", requireAuth(), async (c) => {
  const { userId, adm, roleId } = c.get("auth");
  return c.json(ok({ userId, admin: adm, roleId }));
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit** — SKIP.

---

## Task 11: Wire auth routes + seed, and integration-test the full flow

**Files:**
- Modify: `apps/worker/src/app.ts`
- Test: `apps/worker/test/auth.routes.test.ts`

- [ ] **Step 1: Modify `apps/worker/src/app.ts`** to mount auth routes

Replace the body of `createApp()` so it also mounts `auth` under `/api/auth`:

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { securityHeaders } from "./http/security-headers";
import { toErrorResponse } from "./http/errors";
import { health } from "./routes/health";
import { auth } from "./routes/auth";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", securityHeaders());
  app.route("/api", health);
  app.route("/api/auth", auth);

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as 400);
  });

  app.notFound((c) =>
    c.json({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }, 404),
  );

  return app;
}
```

- [ ] **Step 2: Write the integration test** — `apps/worker/test/auth.routes.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { seedRbac } from "../src/auth/rbac";
import { inviteKeys } from "../src/db/schema";

const TURNSTILE_OK = { "content-type": "application/json" };

// The real Turnstile siteverify is not reachable in tests; stub global fetch
// to always succeed for the siteverify endpoint.
const realFetch = globalThis.fetch;
beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM users; DELETE FROM invite_keys; DELETE FROM role_permissions; DELETE FROM permissions; DELETE FROM roles;",
  );
  const d = db(env.DB);
  await seedRbac(d);
  await d.insert(inviteKeys).values({ code: "GOLDEN", maxUses: 5, uses: 0, roleId: 0, createdAt: 0 }).run();

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
    const setCookie = login.headers.getSetCookie().join("; ");
    expect(setCookie).toContain("access_token=");

    const cookieHeader = login.headers
      .getSetCookie()
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
      new Request("https://x/api/auth/logout", { method: "POST", headers: { cookie: cookieHeader } }),
      env,
    );
    expect(logout.status).toBe(200);

    // After logout the session is revoked; /me must now fail.
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
```

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm test`
Expected: all tests PASS (Plan 1 + all Plan 2 tests).
Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit** — SKIP.

---

## Done criteria for Plan 2
- `npm test` passes for: password, jwt, rbac, session, rate-limit, turnstile, cookies, and the auth integration flow (register → login → /me → logout → revoked).
- `npm run typecheck` clean.
- Passwords hashed with PBKDF2 (210k iters); tokens are HS256; access/refresh in HttpOnly+Secure+SameSite=Strict cookies; sessions revocable via KV; registration invite-only + Turnstile + per-IP rate limit; RBAC deny-by-default with admin-email bypass.
- No secrets committed; no git commits made.

## Notes carried forward
- The login user-enumeration mitigation uses a fixed dummy salt/hash; in a later hardening pass, replace with a precomputed valid dummy hash to fully equalize timing.
- Permission catalog will grow in Plan 3 (`email:*`, `account:*`) and Plan 4 (`send`).
- Admin bootstrap: the first user whose email equals `ADMIN_EMAIL` is treated as admin via the `adm` claim; a dedicated admin-provisioning flow can be added later.
```
