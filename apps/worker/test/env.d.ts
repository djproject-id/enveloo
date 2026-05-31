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
