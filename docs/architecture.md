# Architecture

Enveloo runs as a single Cloudflare Worker that serves a JSON API and (in a later
milestone) the static web app. State lives in Cloudflare D1 (SQL), KV (sessions and rate
limits), and R2 (attachment blobs).

## Components

```
            ┌──────────────────────────── Cloudflare ────────────────────────────┐
            │                                                                     │
  Browser ──┼──HTTP──▶  Worker (Hono)                                             │
            │            ├─ security headers (CSP/HSTS/…)                          │
            │            ├─ auth middleware (JWT cookie → KV session allowlist)    │
            │            ├─ RBAC (deny-by-default, ADMIN_EMAIL bypass)             │
            │            └─ routes: /api/health, /api/auth, /api/emails            │
            │                         │            │             │                │
  Inbound ──┼─Email Routing─▶ email() │            │             │                │
   mail     │            └─ parse → sanitize → store                              │
            │                         ▼            ▼             ▼                 │
            │                       D1 (SQL)    KV (sessions/  R2 (attachment      │
            │                                    rate limits)   blobs)             │
            └─────────────────────────────────────────────────────────────────────┘
                                          │
  Outbound mail  ───────────────────────▶ Resend API
```

## Request flow (API)

1. **Security headers** middleware runs on every response.
2. For protected routes, **`requireAuth`** reads the `access_token` cookie, verifies the
   JWT, then confirms the session still exists in the KV allowlist (so logout/refresh can
   revoke it).
3. **`requirePermission`** enforces a specific permission unless the user is the admin.
4. The handler validates input with Zod, runs its logic through Drizzle, and returns a
   typed `{ success, data | error }` envelope.

## Inbound mail flow

1. Cloudflare Email Routing delivers a message to the Worker's `email()` handler.
2. `ingestEmail()` resolves the recipient against the `accounts` table; unknown
   recipients are dropped.
3. The raw MIME is parsed (`postal-mime`), the HTML body is **sanitized** with
   `HTMLRewriter`, and the message is stored in `emails`.
4. Attachments under the size cap are written to R2 under randomized keys and recorded in
   `attachments`.

## Outbound mail flow

1. `POST /api/emails/send` requires `email:send` and a per-user rate-limit check.
2. The `from` address must be an `account` owned by the caller (anti-spoofing).
3. `sendViaResend()` performs the outbound call; a sanitized copy is stored with
   `direction = "sent"`.

## Data model

| Table | Purpose |
| --- | --- |
| `users` | Accounts that can sign in (hash, salt, role, status) |
| `roles`, `permissions`, `role_permissions` | RBAC mapping |
| `invite_keys` | Invite-only registration codes |
| `accounts` | Email addresses owned by users |
| `emails` | Received and sent messages (`direction`) |
| `attachments` | Attachment metadata; blobs live in R2 |
| `app_meta` | Internal key/value metadata |

Sessions and rate-limit counters are not SQL tables — they live in KV with TTLs.

## Security model

Defense-in-depth is the guiding principle: type safety (TypeScript) + runtime validation
(Zod) + parameterized queries (Drizzle) close the most common classes of bug. Inbound
HTML is sanitized at ingest, and the web app additionally renders message bodies inside a
sandboxed iframe. See the [threat model](security/threat-model.md).
