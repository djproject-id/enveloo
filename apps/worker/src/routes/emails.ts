import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { rateLimit } from "../http/rate-limit";
import { db } from "../db/client";
import {
  emails as emailsTable,
  attachments as attachmentsTable,
  accounts as accountsTable,
} from "../db/schema";
import { requireAuth, requirePermission } from "../http/auth-middleware";
import { sendViaResend } from "../email/send";
import { sanitizeEmailHtml } from "../email/sanitize";

export const emailRoutes = new Hono<{ Bindings: Env }>();

emailRoutes.use("*", requireAuth());

emailRoutes.get("/", requirePermission("email:read"), async (c) => {
  const { userId } = c.get("auth");
  const rows = await db(c.env.DB)
    .select({
      id: emailsTable.id,
      fromAddress: emailsTable.fromAddress,
      fromName: emailsTable.fromName,
      toAddress: emailsTable.toAddress,
      subject: emailsTable.subject,
      unread: emailsTable.unread,
      direction: emailsTable.direction,
      createdAt: emailsTable.createdAt,
    })
    .from(emailsTable)
    .where(eq(emailsTable.userId, userId))
    .orderBy(desc(emailsTable.createdAt))
    .limit(50)
    .all();
  return c.json(ok(rows));
});

const sendSchema = z.object({
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().max(998),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
});

emailRoutes.post("/send", requirePermission("email:send"), async (c) => {
  const { userId } = c.get("auth");
  const rl = await rateLimit(c.env.KV, `send:${userId}`, 20, 3600);
  if (!rl.allowed) throw new AppError("Too many sends", 429, "RATE_LIMIT");

  const body = await validateJson(c, sendSchema);
  if (!body.html && !body.text) throw new AppError("Empty body", 400, "EMPTY_BODY");

  const d = db(c.env.DB);
  const account = await d
    .select()
    .from(accountsTable)
    .where(eq(accountsTable.email, body.from.toLowerCase()))
    .get();
  if (!account || account.userId !== userId) {
    throw new AppError("You do not own this sender address", 403, "FORBIDDEN");
  }

  const result = await sendViaResend(c.env.RESEND_API_KEY, {
    from: body.from,
    to: body.to,
    subject: body.subject,
    html: body.html,
    text: body.text,
  });

  const safeHtml = body.html ? await sanitizeEmailHtml(body.html) : "";
  await d
    .insert(emailsTable)
    .values({
      accountId: account.id,
      userId,
      fromAddress: body.from,
      fromName: "",
      toAddress: body.to,
      subject: body.subject,
      html: safeHtml,
      text: body.text ?? "",
      unread: 0,
      direction: "sent",
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run();

  return c.json(ok({ id: result.id }));
});

emailRoutes.get("/:id", requirePermission("email:read"), async (c) => {
  const id = Number(c.req.param("id"));
  const { userId, adm } = c.get("auth");
  const d = db(c.env.DB);
  const row = await d.select().from(emailsTable).where(eq(emailsTable.id, id)).get();
  if (!row || (row.userId !== userId && !adm)) throw new AppError("Not found", 404, "NOT_FOUND");
  if (row.unread === 1) {
    await d.update(emailsTable).set({ unread: 0 }).where(eq(emailsTable.id, id)).run();
  }
  return c.json(ok(row));
});

emailRoutes.get("/:id/attachments/:attId", requirePermission("email:read"), async (c) => {
  const id = Number(c.req.param("id"));
  const attId = Number(c.req.param("attId"));
  const { userId, adm } = c.get("auth");
  const att = await db(c.env.DB)
    .select()
    .from(attachmentsTable)
    .where(eq(attachmentsTable.id, attId))
    .get();
  if (!att || att.emailId !== id || (att.userId !== userId && !adm)) {
    throw new AppError("Not found", 404, "NOT_FOUND");
  }
  const obj = await c.env.R2.get(att.r2Key);
  if (!obj) throw new AppError("Not found", 404, "NOT_FOUND");
  const safeName = att.filename.replace(/["\r\n]/g, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
