import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { db } from "../db/client";
import { inviteKeys } from "../db/schema";
import { requireAuth, requireAdmin } from "../http/auth-middleware";

export const adminRoutes = new Hono<{ Bindings: Env }>();

adminRoutes.use("*", requireAuth(), requireAdmin());

const createInviteSchema = z.object({
  maxUses: z.number().int().min(1).max(1000).optional().default(1),
  code: z.string().min(4).max(200).optional(),
});

adminRoutes.post("/invites", async (c) => {
  const body = await validateJson(c, createInviteSchema);

  const code =
    body.code ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const d = db(c.env.DB);

  // Pre-check for unique collision to return a clean error.
  const existing = await d
    .select({ id: inviteKeys.id })
    .from(inviteKeys)
    .where(eq(inviteKeys.code, code))
    .get();
  if (existing) {
    throw new AppError("Code already exists", 409, "CODE_TAKEN");
  }

  const createdAt = Math.floor(Date.now() / 1000);
  const result = await d
    .insert(inviteKeys)
    .values({ code, maxUses: body.maxUses, uses: 0, roleId: 0, createdAt })
    .returning({
      id: inviteKeys.id,
      code: inviteKeys.code,
      maxUses: inviteKeys.maxUses,
    })
    .get();

  return c.json(ok({ id: result.id, code: result.code, maxUses: result.maxUses }), 201);
});

adminRoutes.get("/invites", async (c) => {
  const d = db(c.env.DB);
  const rows = await d
    .select({
      id: inviteKeys.id,
      code: inviteKeys.code,
      maxUses: inviteKeys.maxUses,
      uses: inviteKeys.uses,
      createdAt: inviteKeys.createdAt,
    })
    .from(inviteKeys)
    .orderBy(desc(inviteKeys.createdAt))
    .all();

  return c.json(ok(rows));
});

adminRoutes.delete("/invites/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new AppError("Not found", 404, "NOT_FOUND");
  const d = db(c.env.DB);

  const existing = await d
    .select({ id: inviteKeys.id })
    .from(inviteKeys)
    .where(eq(inviteKeys.id, id))
    .get();
  if (!existing) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }

  await d.delete(inviteKeys).where(eq(inviteKeys.id, id)).run();

  return c.json(ok({ deleted: true }));
});
