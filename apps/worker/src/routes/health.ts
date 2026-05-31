import { Hono } from "hono";
import type { Env } from "../env";
import { ok } from "../http/result";

export const health = new Hono<{ Bindings: Env }>();

health.get("/health", async (c) => {
  let dbReachable = false;
  try {
    await c.env.DB.prepare("SELECT 1").first();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
  return c.json(ok({ ok: true, db: dbReachable }));
});
