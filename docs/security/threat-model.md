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

- HTML sanitization is denylist-based; the sandboxed iframe is the primary containment.
  An allowlist sanitizer is a candidate for a future pass.
- The login timing mitigation uses a fixed dummy hash; a precomputed valid dummy would
  equalize timing more precisely.
- Rate limiting uses a KV fixed window whose TTL refreshes on write (approximate, not a
  strict sliding window).

## Reporting

Report vulnerabilities privately per [SECURITY.md](../../SECURITY.md).
