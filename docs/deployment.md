# Deployment

This guide deploys Enveloo to your own Cloudflare account. Everything except the domain
fits within Cloudflare's free tier for personal use.

## Prerequisites

- A domain you control, added to Cloudflare.
- A Cloudflare account and the `wrangler` CLI (`npx wrangler login`).
- A [Resend](https://resend.com) account with your domain verified (for sending).

## 1. Create the resources

```bash
cd apps/worker

# D1 database
npx wrangler d1 create enveloo

# KV namespace
npx wrangler kv namespace create enveloo

# R2 bucket
npx wrangler r2 bucket create enveloo-attachments
```

Copy the generated IDs into `wrangler.toml`, replacing the `REPLACE_WITH_YOUR_*`
placeholders (`database_id` for D1 and `id` for KV).

## 2. Set secrets

```bash
npx wrangler secret put JWT_SECRET        # a long random string
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put ADMIN_EMAIL
```

See [configuration](configuration.md) for what each secret does.

## 3. Apply migrations

```bash
npm run db:migrate:remote
```

## 4. Deploy the Worker

```bash
npm run deploy
```

## 5. Configure inbound mail (Email Routing)

In the Cloudflare dashboard, under your domain → **Email → Email Routing**:

1. Enable Email Routing and verify the required DNS records.
2. Add a route (or catch-all) that delivers to a **Worker**, and select the deployed
   `enveloo` Worker.

Inbound mail for an address is only stored if a matching `accounts` row exists for it.

## 6. Configure outbound mail (Resend)

1. Verify your sending domain in Resend.
2. Ensure the `from` addresses you use exist as `accounts` owned by the sending user.

## 7. Verify

```bash
curl https://<your-worker-domain>/api/health
# {"success":true,"data":{"ok":true,"db":true}}
```

## Notes

- Secrets are managed entirely through `wrangler secret` and never committed.
- Schema changes always go through `npm run db:generate` + `db:migrate:remote`; there is
  no runtime database-initialization endpoint.
- Rotate `JWT_SECRET` to invalidate all existing sessions.
