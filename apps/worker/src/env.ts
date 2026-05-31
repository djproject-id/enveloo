export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  // Secrets (provided via .dev.vars locally, wrangler secret in prod):
  JWT_SECRET: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET: string;
  ADMIN_EMAIL: string;
  DOMAIN: string;
}
