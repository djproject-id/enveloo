import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { db } from "../db/client";
import { accounts as accountsTable } from "../db/schema";
import { requireAuth, requirePermission } from "../http/auth-middleware";

export const accountRoutes = new Hono<{ Bindings: Env }>();

accountRoutes.use("*", requireAuth());

function parseDomains(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
    return [];
  } catch {
    return [];
  }
}

accountRoutes.get("/", requirePermission("account:manage"), async (c) => {
  const { userId } = c.get("auth");
  const rows = await db(c.env.DB)
    .select({
      id: accountsTable.id,
      email: accountsTable.email,
      createdAt: accountsTable.createdAt,
    })
    .from(accountsTable)
    .where(eq(accountsTable.userId, userId))
    .orderBy(desc(accountsTable.createdAt))
    .all();
  return c.json(ok(rows));
});

const createAccountSchema = z.object({
  localPart: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/),
  domain: z.string().min(1),
});

accountRoutes.post("/", requirePermission("account:manage"), async (c) => {
  const { userId } = c.get("auth");
  const body = await validateJson(c, createAccountSchema);

  const allowedDomains = parseDomains(c.env.DOMAIN);
  if (!allowedDomains.includes(body.domain)) {
    throw new AppError("Domain not allowed", 400, "DOMAIN_NOT_ALLOWED");
  }

  const email = `${body.localPart}@${body.domain}`.toLowerCase();
  const d = db(c.env.DB);

  const existing = await d
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, email))
    .get();
  if (existing) {
    throw new AppError("Email already taken", 409, "EMAIL_TAKEN");
  }

  const createdAt = Math.floor(Date.now() / 1000);
  const result = await d
    .insert(accountsTable)
    .values({ email, userId, createdAt })
    .returning({ id: accountsTable.id, email: accountsTable.email })
    .get();

  return c.json(ok({ id: result.id, email: result.email }), 201);
});

accountRoutes.delete("/:id", requirePermission("account:manage"), async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new AppError("Not found", 404, "NOT_FOUND");
  const { userId, adm } = c.get("auth");
  const d = db(c.env.DB);

  const account = await d
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .get();

  if (!account || (account.userId !== userId && !adm)) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  await d.delete(accountsTable).where(eq(accountsTable.id, id)).run();

  return c.json(ok({ deleted: true }));
});
