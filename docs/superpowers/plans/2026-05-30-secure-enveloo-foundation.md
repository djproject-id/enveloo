# Secure Enveloo — Foundation Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable Cloudflare Worker with a security-hardened baseline (security headers, Zod validation, typed error envelope, D1 + Drizzle migrations) and a tested health endpoint.

**Architecture:** A single Cloudflare Worker (Hono) in a monorepo (`apps/worker`, `apps/web`). This plan builds only `apps/worker`'s foundation plus repo-level meta files. The frontend app is scaffolded empty and fleshed out in later plans.

**Tech Stack:** TypeScript (strict), Hono, Cloudflare Workers, D1, Drizzle ORM, Zod, Vitest + `@cloudflare/vitest-pool-workers`, Wrangler.

**Conventions:**
- Package manager: `npm` (no extra global installs required).
- All commands run from `apps/worker/` unless stated otherwise.
- TDD: write the failing test, watch it fail, implement minimally, watch it pass, commit.
- Secrets never enter git. Only `wrangler.toml` (non-secret bindings) and `.dev.vars.example` (placeholder names) are committed.

---

## File Structure (built by this plan)

```
enveloo/
├─ .gitignore
├─ README.md                         # English; minimal for now
├─ LICENSE                           # AGPL-3.0 full text
├─ SECURITY.md
├─ .github/workflows/ci.yml          # lint+typecheck+test, SHA-pinned actions
├─ apps/
│  ├─ web/                           # placeholder only this plan
│  │  └─ .gitkeep
│  └─ worker/
│     ├─ package.json
│     ├─ tsconfig.json
│     ├─ wrangler.toml               # bindings; NO secrets
│     ├─ .dev.vars.example           # placeholder secret names only
│     ├─ vitest.config.ts
│     ├─ drizzle.config.ts
│     ├─ migrations/                 # generated SQL migrations
│     ├─ src/
│     │  ├─ index.ts                 # Worker entry (fetch handler -> Hono app)
│     │  ├─ app.ts                   # Hono app + middleware wiring
│     │  ├─ env.ts                   # Env type (bindings + secrets)
│     │  ├─ http/
│     │  │  ├─ result.ts             # success/error JSON envelope
│     │  │  ├─ errors.ts             # AppError + error handler
│     │  │  ├─ security-headers.ts   # CSP/HSTS/etc middleware
│     │  │  └─ validate.ts           # Zod validation helper
│     │  ├─ db/
│     │  │  ├─ client.ts             # Drizzle client from D1 binding
│     │  │  └─ schema.ts             # tables (starts with app_meta)
│     │  └─ routes/
│     │     └─ health.ts             # GET /api/health
│     └─ test/
│        ├─ health.test.ts
│        ├─ security-headers.test.ts
│        ├─ validate.test.ts
│        └─ errors.test.ts
└─ docs/ ...                         # (spec already present)
```

---

## Task 1: Initialize worker package & TypeScript

**Files:**
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/web/.gitkeep`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore` at repo root**

```gitignore
node_modules/
dist/
.wrangler/
.dev.vars
*.local
*.log
.DS_Store
coverage/
```

- [ ] **Step 2: Create `apps/web/.gitkeep`** (empty file, reserves the frontend folder)

- [ ] **Step 3: Create `apps/worker/package.json`**

```json
{
  "name": "@enveloo/worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply enveloo --local",
    "db:migrate:remote": "wrangler d1 migrations apply enveloo --remote"
  },
  "dependencies": {
    "drizzle-orm": "^0.42.0",
    "hono": "^4.12.16",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.7.5",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "vitest": "~3.0.7",
    "wrangler": "^4.90.0"
  }
}
```

- [ ] **Step 4: Create `apps/worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 5: Install dependencies**

Run (from `apps/worker/`): `npm install`
Expected: completes; `node_modules/` created; `@cloudflare/workers-types` pulled in transitively by wrangler. If types are missing, run `npm install -D @cloudflare/workers-types`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore apps/web/.gitkeep apps/worker/package.json apps/worker/tsconfig.json apps/worker/package-lock.json
git commit -m "chore: scaffold worker package and tooling"
```

---

## Task 2: Wrangler config, Env types, and Vitest harness

**Files:**
- Create: `apps/worker/wrangler.toml`
- Create: `apps/worker/.dev.vars.example`
- Create: `apps/worker/src/env.ts`
- Create: `apps/worker/vitest.config.ts`

- [ ] **Step 1: Create `apps/worker/wrangler.toml`** (non-secret bindings only)

```toml
name = "enveloo"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "enveloo"
database_id = "REPLACE_WITH_YOUR_D1_ID"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_YOUR_KV_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "enveloo-attachments"
```

- [ ] **Step 2: Create `apps/worker/.dev.vars.example`** (names only — never real values)

```ini
# Copy to .dev.vars (gitignored) and fill with local dev values.
JWT_SECRET=
RESEND_API_KEY=
TURNSTILE_SECRET=
ADMIN_EMAIL=
```

- [ ] **Step 3: Create `apps/worker/src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  // Secrets (provided via .dev.vars locally, wrangler secret in prod):
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET: string;
  ADMIN_EMAIL: string;
}
```

- [ ] **Step 4: Create `apps/worker/vitest.config.ts`**

```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            JWT_SECRET: "test-secret",
            RESEND_API_KEY: "test-resend",
            TURNSTILE_SECRET: "test-turnstile",
            ADMIN_EMAIL: "admin@example.com",
          },
        },
      },
    },
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add apps/worker/wrangler.toml apps/worker/.dev.vars.example apps/worker/src/env.ts apps/worker/vitest.config.ts
git commit -m "chore: add wrangler config, env types, and vitest harness"
```

---

## Task 3: Result envelope (success/error JSON shape)

**Files:**
- Create: `apps/worker/src/http/result.ts`
- Test: `apps/worker/test/errors.test.ts` (shared with Task 4; create now)

- [ ] **Step 1: Write the failing test** — create `apps/worker/test/errors.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { ok, fail } from "../src/http/result";

describe("result envelope", () => {
  it("wraps success data", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });
  it("wraps an error message and code", () => {
    expect(fail("nope", "BAD")).toEqual({
      success: false,
      error: { code: "BAD", message: "nope" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- errors`
Expected: FAIL — cannot find module `../src/http/result`.

- [ ] **Step 3: Write minimal implementation** — create `apps/worker/src/http/result.ts`

```ts
export interface Ok<T> { success: true; data: T; }
export interface Fail { success: false; error: { code: string; message: string }; }

export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

export function fail(message: string, code = "ERROR"): Fail {
  return { success: false, error: { code, message } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- errors`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/http/result.ts apps/worker/test/errors.test.ts
git commit -m "feat: add typed result envelope"
```

---

## Task 4: AppError + global error handler

**Files:**
- Create: `apps/worker/src/http/errors.ts`
- Modify: `apps/worker/test/errors.test.ts` (append cases)

- [ ] **Step 1: Append failing tests to `apps/worker/test/errors.test.ts`**

```ts
import { AppError, toErrorResponse } from "../src/http/errors";

describe("AppError", () => {
  it("carries status and code", () => {
    const e = new AppError("forbidden", 403, "FORBIDDEN");
    expect(e.status).toBe(403);
    expect(e.code).toBe("FORBIDDEN");
  });
  it("maps AppError to a fail envelope + status", () => {
    const r = toErrorResponse(new AppError("nope", 401, "AUTH"));
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: { code: "AUTH", message: "nope" } });
  });
  it("maps unknown errors to 500 without leaking the message", () => {
    const r = toErrorResponse(new Error("db password is hunter2"));
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe("Internal error");
    expect(JSON.stringify(r.body)).not.toContain("hunter2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- errors`
Expected: FAIL — cannot find module `../src/http/errors`.

- [ ] **Step 3: Write minimal implementation** — create `apps/worker/src/http/errors.ts`

```ts
import { fail, type Fail } from "./result";

export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(err: unknown): { status: number; body: Fail } {
  if (err instanceof AppError) {
    return { status: err.status, body: fail(err.message, err.code) };
  }
  // Never leak internal error text to clients.
  return { status: 500, body: fail("Internal error", "INTERNAL") };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- errors`
Expected: PASS (5 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/http/errors.ts apps/worker/test/errors.test.ts
git commit -m "feat: add AppError and leak-safe error handler"
```

---

## Task 5: Security headers middleware

**Files:**
- Create: `apps/worker/src/http/security-headers.ts`
- Test: `apps/worker/test/security-headers.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/worker/test/security-headers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "../src/http/security-headers";

function appWithHeaders() {
  const app = new Hono();
  app.use("*", securityHeaders());
  app.get("/x", (c) => c.text("ok"));
  return app;
}

describe("securityHeaders", () => {
  it("sets HSTS, nosniff, frame-ancestors none, referrer policy, and a CSP", async () => {
    const res = await appWithHeaders().request("/x");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- security-headers`
Expected: FAIL — cannot find module `../src/http/security-headers`.

- [ ] **Step 3: Write minimal implementation** — create `apps/worker/src/http/security-headers.ts`

```ts
import { createMiddleware } from "hono/factory";

export function securityHeaders() {
  return createMiddleware(async (c, next) => {
    await next();
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join("; "),
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- security-headers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/http/security-headers.ts apps/worker/test/security-headers.test.ts
git commit -m "feat: add strict security headers middleware"
```

---

## Task 6: Zod validation helper

**Files:**
- Create: `apps/worker/src/http/validate.ts`
- Test: `apps/worker/test/validate.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/worker/test/validate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Hono } from "hono";
import { validateJson } from "../src/http/validate";
import { AppError } from "../src/http/errors";

const schema = z.object({ email: z.string().email() });

function app() {
  const a = new Hono();
  a.post("/x", async (c) => {
    const body = await validateJson(c, schema);
    return c.json({ email: body.email });
  });
  a.onError((err, c) => {
    if (err instanceof AppError) return c.json({ code: err.code }, err.status as 400);
    return c.json({ code: "INTERNAL" }, 500);
  });
  return a;
}

describe("validateJson", () => {
  it("returns parsed body for valid input", async () => {
    const res = await app().request("/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.com" });
  });

  it("throws AppError 422 for invalid input", async () => {
    const res = await app().request("/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "VALIDATION" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- validate`
Expected: FAIL — cannot find module `../src/http/validate`.

- [ ] **Step 3: Write minimal implementation** — create `apps/worker/src/http/validate.ts`

```ts
import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

export async function validateJson<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError("Invalid JSON body", 422, "VALIDATION");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("Validation failed", 422, "VALIDATION");
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- validate`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/http/validate.ts apps/worker/test/validate.test.ts
git commit -m "feat: add Zod JSON validation helper"
```

---

## Task 7: Drizzle schema, client, and first migration

**Files:**
- Create: `apps/worker/src/db/schema.ts`
- Create: `apps/worker/src/db/client.ts`
- Create: `apps/worker/drizzle.config.ts`
- Create: `apps/worker/migrations/` (generated)

- [ ] **Step 1: Create `apps/worker/src/db/schema.ts`** (start with one table to prove the pipeline)

```ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 2: Create `apps/worker/src/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function db(d1: D1Database) {
  return drizzle(d1, { schema });
}
```

- [ ] **Step 3: Create `apps/worker/drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  driver: "d1-http",
} satisfies Config;
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new `migrations/0000_*.sql` file containing `CREATE TABLE app_meta`.

- [ ] **Step 5: Apply migration to the local D1**

Run: `npm run db:migrate:local`
Expected: "Migrations applied" against the local Miniflare D1.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/db/schema.ts apps/worker/src/db/client.ts apps/worker/drizzle.config.ts apps/worker/migrations
git commit -m "feat: add drizzle schema, client, and initial migration"
```

---

## Task 8: Health route (proves DB connectivity end-to-end)

**Files:**
- Create: `apps/worker/src/routes/health.ts`
- Test: `apps/worker/test/health.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/worker/test/health.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { health } from "../src/routes/health";
import { Hono } from "hono";
import type { Env } from "../src/env";

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.route("/api", health);
  return a;
}

describe("GET /api/health", () => {
  it("returns ok:true and a reachable db flag", async () => {
    const res = await app().request("/api/health", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { ok: true, db: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- health`
Expected: FAIL — cannot find module `../src/routes/health`.

- [ ] **Step 3: Write minimal implementation** — create `apps/worker/src/routes/health.ts`

```ts
import { Hono } from "hono";
import type { Env } from "../env";
import { ok } from "../http/result";

export const health = new Hono<{ Bindings: Env }>();

health.get("/health", async (c) => {
  let dbReachable = false;
  try {
    await c.env.DB.prepare("SELECT 1").first();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
  return c.json(ok({ ok: true, db: dbReachable }));
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- health`
Expected: PASS. (If `db` is false, the local migration from Task 7 wasn't applied — re-run `npm run db:migrate:local`.)

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/routes/health.ts apps/worker/test/health.test.ts
git commit -m "feat: add health route with db connectivity check"
```

---

## Task 9: Wire the Hono app + Worker entry

**Files:**
- Create: `apps/worker/src/app.ts`
- Create: `apps/worker/src/index.ts`

- [ ] **Step 1: Create `apps/worker/src/app.ts`** (compose middleware + routes + error handler)

```ts
import { Hono } from "hono";
import type { Env } from "./env";
import { securityHeaders } from "./http/security-headers";
import { toErrorResponse } from "./http/errors";
import { health } from "./routes/health";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", securityHeaders());
  app.route("/api", health);

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as 400);
  });

  app.notFound((c) => c.json({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }, 404));

  return app;
}
```

- [ ] **Step 2: Create `apps/worker/src/index.ts`** (Worker entry)

```ts
import { createApp } from "./app";
import type { Env } from "./env";

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 3: Add an integration test** — create `apps/worker/test/app.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createApp } from "../src/app";

describe("app integration", () => {
  it("health endpoint carries security headers", async () => {
    const res = await createApp().request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("unknown route returns 404 envelope", async () => {
    const res = await createApp().request("/api/nope", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});
```

- [ ] **Step 4: Run the full test suite + typecheck**

Run: `npm test`
Expected: all tests PASS.
Run: `npm run typecheck`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/app.ts apps/worker/src/index.ts apps/worker/test/app.test.ts
git commit -m "feat: wire hono app and worker entry"
```

---

## Task 10: Repo meta files (LICENSE, README, SECURITY) + CI

**Files:**
- Create: `LICENSE`
- Create: `README.md`
- Create: `SECURITY.md`
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `LICENSE`** — paste the full official **GNU AGPL-3.0** text (from https://www.gnu.org/licenses/agpl-3.0.txt). Do not paraphrase; use the verbatim text.

- [ ] **Step 2: Create `README.md`** (English, minimal)

```markdown
# Enveloo

A self-hosted, security-first, multi-address email service for Cloudflare Workers.

> Status: early development (foundation). See `docs/` for the design spec.

## Stack
TypeScript · Hono · Cloudflare Workers · D1 · Drizzle · R2 · KV.

## Development
```bash
cd apps/worker
npm install
npm run db:migrate:local
npm test
npm run dev
```

## License
AGPL-3.0 — see [LICENSE](./LICENSE).
```

- [ ] **Step 3: Create `SECURITY.md`**

```markdown
# Security Policy

## Reporting a Vulnerability
Please report security issues privately via GitHub Security Advisories
(the "Report a vulnerability" button on the Security tab). Do not open public
issues for vulnerabilities. We aim to acknowledge within 72 hours.

## Scope
This project handles email content and credentials. Areas of particular interest:
authentication/session handling, inbound email sanitization, attachment handling,
and access control.
```

- [ ] **Step 4: Create `.github/workflows/ci.yml`** (actions pinned to commit SHAs, least privilege)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/worker
    steps:
      # actions/checkout@v4.2.2
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      # actions/setup-node@v4.1.0
      - uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af
        with:
          node-version: "22"
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

> Note: verify the pinned SHAs match the intended tags before pushing (the comments show the intended versions). Update if newer patch releases exist.

- [ ] **Step 5: Run final verification**

Run: `npm test && npm run typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add LICENSE README.md SECURITY.md .github/workflows/ci.yml
git commit -m "docs: add AGPL-3.0 license, readme, security policy, and CI"
```

---

## Done criteria for Plan 1
- `npm test` passes (result envelope, errors, security headers, validation, health, app integration).
- `npm run typecheck` is clean.
- `npm run dev` serves `GET /api/health` returning `{ success: true, data: { ok: true, db: true } }` with security headers.
- Repo has AGPL-3.0 LICENSE, English README/SECURITY, and a SHA-pinned CI workflow.
- No secrets are committed; only `.dev.vars.example` placeholder names exist.

## Note carried to Plan 2
- Git is intentionally not initialized yet (operator deferred identity setup). Before the
  first commit, initialize the repo and set a privacy-preserving identity
  (`git config user.email <username>@users.noreply.github.com`). Until then, treat the
  "Commit" steps as the intended commit boundaries to apply once git is set up.
```
