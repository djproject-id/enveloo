# Configuration

Enveloo is configured through Cloudflare bindings (in `wrangler.toml`) and secrets
(never committed).

## Bindings (`apps/worker/wrangler.toml`)

| Binding | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 database | Primary relational store |
| `KV` | KV namespace | Sessions and rate-limit counters |
| `R2` | R2 bucket | Attachment blobs |

The `database_id`, KV `id`, and bucket name placeholders in `wrangler.toml` must be
replaced with the IDs of resources in your own Cloudflare account (see
[deployment](deployment.md)).

## Secrets

Secrets are **never** stored in `wrangler.toml`, code, or git. Locally they go in
`apps/worker/.dev.vars` (git-ignored); in production they are set with
`wrangler secret put`.

| Secret | Description |
| --- | --- |
| `JWT_SECRET` | Signing key for access/refresh tokens. Use a long random value. |
| `RESEND_API_KEY` | API key for sending mail through Resend. |
| `TURNSTILE_SECRET` | Cloudflare Turnstile secret for captcha verification. |
| `ADMIN_EMAIL` | The email address treated as the administrator. |

### Local development

Copy the example file and fill in development values:

```bash
cd apps/worker
cp .dev.vars.example .dev.vars
# edit .dev.vars
```

`.dev.vars.example` lists the required names only — it contains no real values and is the
only secrets-related file committed to the repository.

### Production

```bash
cd apps/worker
wrangler secret put JWT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET
wrangler secret put ADMIN_EMAIL
```

## Token lifetimes

| Setting | Value | Where |
| --- | --- | --- |
| Access token TTL | 900s (15 min) | `src/http/cookies.ts` |
| Refresh token TTL | 604800s (7 days) | `src/http/cookies.ts` |
| Login rate limit | 10 / 15 min per IP | `src/routes/auth.ts` |
| Register rate limit | 5 / hour per IP | `src/routes/auth.ts` |
| Send rate limit | 20 / hour per user | `src/routes/emails.ts` |
| Max attachment size | 10 MiB | `src/email/receive.ts` |

Adjust these constants in the referenced files to suit your deployment.
