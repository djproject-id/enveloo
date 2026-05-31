import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            JWT_SECRET: "test-secret",
            RESEND_API_KEY: "test-resend",
            TURNSTILE_SECRET: "test-turnstile",
            ADMIN_EMAIL: "admin@example.com",
            DOMAIN: '["mydomain.com"]',
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
