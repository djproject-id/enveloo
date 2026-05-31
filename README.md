enveloo
=======

**Security-first, self-hosted email for Cloudflare Workers.**

Own a single domain, create unlimited addresses under it, and receive / read / send mail
from a service that runs on Cloudflare's free tier. Built security-first from the first
commit: secrets never touch git, every inbound message is sanitized, and every session
can be revoked.

![License](https://img.shields.io/badge/license-AGPL--3.0-yellow?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square)
![Tests](https://img.shields.io/badge/tests-44%20passing-brightgreen?style=flat-square)

* * *

## Why enveloo

Feature | What it gives you
--- | ---
📬 Multi-address | Unlimited addresses under one domain (`shop@you.com`, `signup@you.com`, …)
🔒 Sanitized inbound HTML | Scripts, iframes, forms, event handlers, and `javascript:` URLs stripped before storage
🍪 Revocable sessions | Short-lived JWT + refresh in `HttpOnly` cookies, backed by a KV allowlist — logout actually logs out
🛡️ Anti-spoof sending | The `from` address must be one you own; no sending as someone else
🎟️ Invite-only signup | Registration gated by invite codes + Turnstile + per-IP rate limiting
🔑 Deny-by-default RBAC | Roles and permissions; access denied unless explicitly granted
💸 Runs on free tier | Cloudflare Workers + D1 + KV + R2; only the domain costs money

* * *

## Quick start

Requires Node.js 22+ and npm. No Cloudflare account is needed for local development —
Miniflare simulates D1, KV, and R2.

```sh
cd apps/worker
npm install
npm run db:migrate:local     # apply migrations to the local D1
npm test                     # 44 tests across 19 files
npm run dev                  # http://localhost:8787
```

```sh
curl http://localhost:8787/api/health
# {"success":true,"data":{"ok":true,"db":true}}
```

* * *

## Usage (HTTP API)

```sh
POST /api/auth/register      # invite-only; email + password + inviteCode + turnstileToken
POST /api/auth/login         # sets HttpOnly access + refresh cookies
POST /api/auth/refresh       # rotates the session
POST /api/auth/logout        # revokes the session
GET  /api/auth/me            # current identity

GET  /api/emails             # list your mail (newest first)
GET  /api/emails/:id         # read one (HTML already sanitized)
GET  /api/emails/:id/attachments/:attId   # forced download, nosniff
POST /api/emails/send        # send via Resend (from an address you own)
```

Inbound mail is delivered to the Worker's `email()` handler by Cloudflare Email Routing,
parsed, sanitized, and stored — only for recipients that exist as accounts.

* * *

## Threat model

What enveloo protects against, and what it does not.

Protects against | How
--- | ---
✅ Credential theft | PBKDF2-HMAC-SHA256 (210k iterations), per-user salt, constant-time compare
✅ Token theft via XSS | Tokens in `HttpOnly` + `Secure` + `SameSite=Strict` cookies; strict CSP; inbound HTML sanitized
✅ Stored XSS from emails | `HTMLRewriter` strips dangerous markup; the web app renders bodies in a sandboxed iframe
✅ Privilege escalation | Deny-by-default RBAC; admin limited to `ADMIN_EMAIL`
✅ SQL injection | Drizzle parameterized queries only
✅ Sender spoofing | `from` must be an account owned by the caller
✅ Brute force / abuse | Per-IP and per-account rate limits; Turnstile on register/login
✅ Secret leakage | Secrets only via Cloudflare Secrets; never in code, git, logs, or URLs

Does **not** protect against | Note
--- | ---
❌ A compromised Cloudflare account | Bindings and secrets live there; secure it with 2FA
❌ Zero-day bugs in dependencies | Pinned versions + lockfile reduce, but cannot eliminate, risk
❌ Phishing of your users | Out of scope; user education applies

Full details: [`docs/security/threat-model.md`](docs/security/threat-model.md).

* * *

## File layout

```
.
├─ apps/
│  ├─ worker/                  # Cloudflare Worker — API + email() handler  (built)
│  │  ├─ src/
│  │  │  ├─ http/              # result envelope, errors, security headers, validation, cookies, auth middleware
│  │  │  ├─ auth/              # PBKDF2, JWT, sessions, RBAC
│  │  │  ├─ email/             # parse, sanitize, ingest, send
│  │  │  ├─ routes/            # health, auth, emails
│  │  │  └─ db/                # Drizzle schema + client
│  │  ├─ migrations/           # generated SQL
│  │  └─ test/                 # Vitest (unit + integration)
│  └─ web/                     # Vue 3 web app                              (planned)
└─ docs/                       # architecture, configuration, deployment, security
```

* * *

## Architecture

A single Cloudflare Worker (Hono) serves the API and runs the inbound `email()` handler.
State lives in D1 (SQL), KV (sessions + rate-limit counters), and R2 (attachment blobs).
Every request passes security headers → auth (JWT cookie verified against the KV session
allowlist) → deny-by-default RBAC → a Zod-validated handler.

See [`docs/architecture.md`](docs/architecture.md) for diagrams and data flow.

* * *

## Configuration & deployment

- Bindings and secrets: [`docs/configuration.md`](docs/configuration.md)
- Step-by-step Cloudflare deploy: [`docs/deployment.md`](docs/deployment.md)

Secrets (`JWT_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `ADMIN_EMAIL`) are set with
`wrangler secret put` and never committed. The only secrets-related file in the repo is
`apps/worker/.dev.vars.example`, which lists names only.

* * *

## Status

The secure **backend MVP is complete and tested** — foundation, authentication & RBAC,
receive & read, compose & send. Next: the Vue web app, an account-management API, and the
production deployment pass.

* * *

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Report security issues privately per
[`SECURITY.md`](SECURITY.md).

* * *

## License

AGPL-3.0 © 2026 djproject-id — run a modified version as a network service and you must
share your source under the same license. See [`LICENSE`](LICENSE).
