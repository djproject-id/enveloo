# Threat Model

A concise model of what Enveloo protects, the main threats, and the mitigations in place.
It is a living document; update it as the system evolves.

## Assets

- User credentials and sessions.
- Email content and attachments (potentially sensitive).
- The operator's domain reputation (must not become a spam/spoofing source).
- Infrastructure secrets (`JWT_SECRET`, `RESEND_API_KEY`, etc.).

## Trust boundaries

- **Browser ↔ Worker** — all input is untrusted; validated with Zod and gated by
  auth/RBAC.
- **Inbound email ↔ Worker** — message content is fully untrusted and sanitized before
  storage.
- **Worker ↔ Cloudflare bindings (D1/KV/R2)** — trusted, but accessed only through
  parameterized queries and scoped keys.
- **Worker ↔ Resend** — outbound only; authenticated with a secret API key.

## Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Credential theft via weak hashing | PBKDF2-HMAC-SHA256, 210k iterations, per-user salt, constant-time compare |
| Token theft via XSS | Tokens in `HttpOnly`+`Secure`+`SameSite=Strict` cookies; strict CSP; inbound HTML sanitized |
| Stored XSS from email bodies | `HTMLRewriter` removes scripts/iframes/forms/event-handlers/`javascript:`; web app renders in a sandboxed iframe |
| Session cannot be revoked | KV session allowlist; logout/refresh delete the session |
| Privilege escalation | Deny-by-default RBAC; permissions checked per route; admin limited to `ADMIN_EMAIL` |
| SQL injection | Drizzle parameterized queries only |
| Sender spoofing | `from` must be an account owned by the authenticated user |
| Malicious attachments | Randomized storage keys, forced download, `nosniff`, size cap |
| Brute force / abuse | Per-IP and per-account rate limits; Turnstile on register/login |
| Secret leakage | Secrets only via Cloudflare Secrets; never in code, git, logs, or URLs; client errors never echo internals |
| User enumeration on login | Password verification runs even for unknown accounts to reduce timing signals |

## Known limitations (tracked for hardening)

- HTML sanitization removes dangerous elements (script/iframe/form/...) and event-handler
  attributes by denylist, and restricts URL attributes to an allowlist of schemes
  (http/https/mailto). The sandboxed iframe remains the primary containment. A full
  allowlist sanitizer is a candidate for a future pass.
- The login timing mitigation uses a fixed dummy hash; a precomputed valid dummy would
  equalize timing more precisely.
- **Rate limiting is non-atomic.** It uses a KV read-then-write fixed window whose TTL
  refreshes on write. Under a concurrent burst the counter can undercount, weakening the
  limit. Hardening path: a Durable Object atomic counter. Acceptable for single-operator,
  invite-only deployments.
- **First-admin bootstrap is not transactional.** The "first user whose email ==
  ADMIN_EMAIL, when the users table is empty, registers without an invite" check reads the
  user count and inserts without a transaction, and trusts the email string (no proof of
  control). Safe for a single operator who deploys and registers immediately; set
  ADMIN_EMAIL via `wrangler secret` and create the admin account right after deploy.

## Reporting

Report vulnerabilities privately per [SECURITY.md](../../SECURITY.md).
