# Contributing to Enveloo

Thanks for your interest in improving Enveloo. This guide covers local setup, the
expected workflow, and the quality bar for changes.

## Prerequisites

- Node.js 22+ and npm
- No Cloudflare account is needed for development or tests (Miniflare simulates the
  bindings locally).

## Local setup

```bash
cd apps/worker
npm install
npm run db:migrate:local
npm test
```

## Project structure

| Path | Purpose |
| --- | --- |
| `apps/worker/src/http/` | HTTP plumbing: result envelope, errors, security headers, validation, cookies, auth middleware |
| `apps/worker/src/auth/` | Password hashing, JWT, sessions, RBAC |
| `apps/worker/src/email/` | Inbound parse, HTML sanitization, ingest, outbound send |
| `apps/worker/src/routes/` | Hono route groups (`health`, `auth`, `emails`) |
| `apps/worker/src/db/` | Drizzle schema and client |
| `apps/worker/migrations/` | Generated SQL migrations |
| `apps/worker/test/` | Vitest suites (unit + integration) |

## Workflow

1. **Write a test first.** Every behavioral change should be covered by a test in
   `apps/worker/test/`. Follow the existing red → green → refactor pattern.
2. **Keep modules focused.** One clear responsibility per file; communicate through
   small, well-typed interfaces.
3. **Validate all input.** Every endpoint parses its body with a Zod schema.
4. **Never leak internals.** Errors returned to clients must not include stack traces,
   SQL, or secret material (see `src/http/errors.ts`).
5. **Run the gate before opening a PR:**

   ```bash
   npm run typecheck
   npm test
   ```

## Database changes

Schema lives in `src/db/schema.ts`. After editing it, generate a migration — never edit
the database at runtime:

```bash
npm run db:generate
npm run db:migrate:local
```

## Coding standards

- TypeScript `strict` mode; no `any` escapes without justification.
- Parameterized queries only (Drizzle) — never build SQL by string concatenation.
- Secrets come from the environment (`c.env.*`); never hard-code them or log them.

## Security

Do not open public issues for vulnerabilities. Follow the private disclosure process in
[SECURITY.md](SECURITY.md).

## License of contributions

By contributing, you agree that your contributions are licensed under the project's
[AGPL-3.0](LICENSE) license.
