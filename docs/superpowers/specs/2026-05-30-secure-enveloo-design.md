# Secure Enveloo — Design Specification

**Status:** Draft for review
**Date:** 2026-05-30
**Scope of this spec:** v1 (security-hardened MVP)

---

## 1. Summary

A self-hosted, multi-address email service that runs on Cloudflare Workers, built
**security-first** from the ground up. It lets the operator own a single domain and
create unlimited addresses under it (e.g. `shop@mydomain.com`, `signup@mydomain.com`),
receive and send mail through a web UI, all on Cloudflare's free tier plus a domain.

This project is an **original, clean-room implementation** of a self-hosted webmail
concept. No third-party source code is used; therefore no attribution is owed, and the
project's git history contains only the operator's own commits.

### Non-goals for v1
Telegram notifications, third-party OAuth login, AI OTP extraction, analytics
dashboards, and forwarding rules are deferred to v2. Keeping the v1 attack surface small
is a deliberate security decision.

---

## 2. Goals & Success Criteria

- Receive email to any address under the operator's domain and read it in a web UI.
- Compose and send email from those addresses.
- Multiple users with role-based permissions; invite-only registration.
- Every security control listed in §6 is present and enforced in v1.
- Runs within Cloudflare free-tier limits for personal use.
- Documentation is **English-only**; license is **AGPL-3.0**; git history is clean.

---

## 3. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Type safety reduces whole classes of bugs/vulns. |
| Backend | Hono on Cloudflare Workers | Lightweight, first-class Workers support. |
| Database | Cloudflare D1 + Drizzle ORM | Parameterized queries → SQL-injection-safe by default. |
| Object storage | Cloudflare R2 | Attachments; free tier. |
| KV | Cloudflare KV | Session allowlist + rate-limit counters. |
| Input validation | Zod | Schema validation on every endpoint. |
| Frontend | Vue 3 + Vite + TypeScript + Tailwind | Light, well-supported, large reference base. |
| Inbound mail | Cloudflare Email Routing → Worker + `postal-mime` | Native, free parsing of incoming MIME. |
| Outbound mail | Resend API | Realistic send path on CF; free up to ~3k/month. |
| HTML sanitization | sanitize-html (or equivalent) | Strip dangerous markup from inbound email. |

---

## 4. Architecture (Option A — single Worker)

One Cloudflare Worker serves both the JSON API (Hono) and the static frontend assets
(Workers Static Assets). Monorepo layout:

```
enveloo/
├─ apps/
│  ├─ worker/        # Hono API + email() handler + Drizzle schema/migrations
│  └─ web/           # Vue 3 + Vite SPA
├─ docs/             # English documentation
├─ LICENSE           # AGPL-3.0
├─ SECURITY.md
├─ CONTRIBUTING.md
└─ README.md
```

**Why one Worker (not split API + Pages):** single deploy, lowest cost, fewer moving
parts. A strict CSP gives adequate isolation for an MVP; splitting origins is a v2+
consideration if needed.

### Request flow
- Browser → Worker → Hono router → auth middleware → authz middleware → handler →
  Drizzle → D1.
- Inbound email → Cloudflare Email Routing → Worker `email()` handler → parse
  (`postal-mime`) → sanitize → persist (D1 + R2 for attachments).
- Outbound email → handler → Resend API.

---

## 5. Data Model (initial tables)

Managed exclusively via **Drizzle migrations** (run at deploy). There is **no runtime
DB-init endpoint** (see §6.E).

- `users` — id, email, password_hash, password_salt, status, created_at, ...
- `roles` — id, name, is_default
- `permissions` — id, key
- `role_permissions` — role_id, permission_id
- `accounts` — the email addresses owned by users
- `emails` — received/sent messages (sanitized HTML + text)
- `attachments` — metadata; blobs live in R2 under randomized keys
- `sessions` — modeled in KV (allowlist), not a SQL table
- `audit_log` — security-relevant events
- `invite_keys` — invite-only registration codes
- `rate_limits` — modeled in KV counters

Exact columns finalized during implementation planning.

---

## 6. Security Design (the core requirement)

Controls are designed in from day one, not bolted on.

### A. Identity & passwords
- **PBKDF2-HMAC-SHA256**, ≥210,000 iterations, per-user random salt (native WebCrypto,
  zero dependencies). Upgrade path to Argon2id via WASM documented.
- Login issues a **short-lived access JWT (~15 min) + a refresh token**.
- Tokens stored in **`HttpOnly` + `Secure` + `SameSite=Strict` cookies**, never in
  localStorage → not reachable by JavaScript, defeats XSS token theft.
- **Session allowlist in KV** → sessions can be revoked / force-logout supported.

### B. Per-endpoint gate
- **Zod schema validation** on all inputs; malformed requests rejected before logic.
- **Deny-by-default authorization**: access denied unless an explicit permission grants
  it. Least-privilege RBAC.
- **Rate limiting** per-IP and per-account on login, register, and send.
- **Cloudflare Turnstile** CAPTCHA on register and login.

### C. Email content (the #1 webmail risk)
- **Sanitize inbound HTML** (remove `<script>`, inline event handlers, `javascript:`
  URLs, etc.) before storage/render.
- **Render message bodies inside a sandboxed `<iframe sandbox>`** → defense-in-depth if
  sanitization is ever bypassed.

### D. Attachments
- Enforced size limits; **randomized storage keys** (not user-supplied filenames);
  always served with `Content-Disposition: attachment`; MIME-sniffing protection
  (`X-Content-Type-Options: nosniff`); never executed in the app origin.

### E. Infrastructure & secrets
- **All secrets via Cloudflare Secrets**; never in code or git. `.dev.vars` is
  gitignored.
- **No secret-in-URL init endpoint.** Schema changes happen through Drizzle migrations
  at deploy time. (This removes a known weak pattern from the reference project.)
- **Strict security headers**: CSP, HSTS, `X-Content-Type-Options`, `frame-ancestors`,
  `Referrer-Policy`.
- **Audit logging** for login, failed login, permission changes, and sends.

---

## 7. Ownership, Privacy & Licensing

### Clean-room & history
- Repo starts with a fresh `git init`; no fork, no upstream remote.
- No upstream code is copied → no attribution owed, no trace of any other author.

### Operator privacy (security-first applies to the author too)
- Commit identity uses a **GitHub `noreply` email**
  (`<username>@users.noreply.github.com`), not a personal address, so the author's real
  email is never exposed in the public history.
- A single consistent project handle (real name or pseudonym — operator's choice).
- **Pre-commit secret scanning** to prevent accidental token/password pushes.
- Strip **EXIF metadata** from documentation screenshots.

### License
- **AGPL-3.0.** Anyone who modifies and runs it as a network service must release their
  source. This protects the work from being taken closed-source or stripped of credit.

---

## 8. Documentation Plan (English only)

- `README.md` — overview, features, quick start
- `docs/deployment.md` — step-by-step Cloudflare deployment
- `docs/configuration.md` — environment variables & secrets reference
- `docs/architecture.md` — system overview
- `docs/security/threat-model.md` — trust boundaries & mitigations
- `SECURITY.md` — vulnerability disclosure policy
- `CONTRIBUTING.md` — contributor guide

---

## 9. Open Items (to confirm before/during planning)

- Git commit identity: chosen name/handle and GitHub username (for the noreply email).
- Domain to be used (operator must own one; ~Rp150k/year).
- Resend account + domain verification for outbound mail.
