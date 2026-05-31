import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { ok } from "../http/result";
import { AppError } from "../http/errors";
import { validateJson } from "../http/validate";
import { rateLimit } from "../http/rate-limit";
import { verifyTurnstile } from "../http/turnstile";
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
  ACCESS_TTL,
  REFRESH_TTL,
} from "../http/cookies";
import { hashPassword, verifyPassword } from "../auth/password";
import { signJwt, verifyJwt } from "../auth/jwt";
import { createSession, revokeSession, getSession } from "../auth/session";
import { db } from "../db/client";
import { users, inviteKeys } from "../db/schema";
import { defaultRoleId } from "../auth/rbac";
import { requireAuth } from "../http/auth-middleware";

export const auth = new Hono<{ Bindings: Env }>();

const credsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  turnstileToken: z.string().min(1).max(4000),
});
const registerSchema = credsSchema.extend({ inviteCode: z.string().min(1).max(200) });

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header("cf-connecting-ip") ?? "0.0.0.0";
}

async function issueTokens(c: { env: Env }, userId: number, isAdmin: boolean, roleId: number) {
  const sid = crypto.randomUUID();
  await createSession(c.env.KV, userId, sid, REFRESH_TTL);
  const access = await signJwt(
    c.env.JWT_SECRET,
    { sub: userId, sid, adm: isAdmin, role: roleId },
    ACCESS_TTL,
  );
  const refresh = await signJwt(c.env.JWT_SECRET, { sub: userId, sid, typ: "refresh" }, REFRESH_TTL);
  return { access, refresh };
}

auth.post("/register", async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env.KV, `register:${ip}`, 5, 3600);
  if (!rl.allowed) throw new AppError("Too many attempts", 429, "RATE_LIMIT");

  const body = await validateJson(c, registerSchema);
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken))) {
    throw new AppError("Captcha failed", 400, "CAPTCHA");
  }

  const d = db(c.env.DB);
  const invite = await d.select().from(inviteKeys).where(eq(inviteKeys.code, body.inviteCode)).get();
  if (!invite || invite.uses >= invite.maxUses) {
    throw new AppError("Invalid invite code", 400, "INVITE");
  }

  const existing = await d.select().from(users).where(eq(users.email, body.email)).get();
  if (existing) throw new AppError("Email already registered", 409, "EMAIL_TAKEN");

  const { hash, salt } = await hashPassword(body.password);
  const roleId = invite.roleId > 0 ? invite.roleId : await defaultRoleId(d);
  await d
    .insert(users)
    .values({
      email: body.email,
      passwordHash: hash,
      passwordSalt: salt,
      roleId,
      status: 1,
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run();
  await d.update(inviteKeys).set({ uses: invite.uses + 1 }).where(eq(inviteKeys.id, invite.id)).run();

  return c.json(ok({ registered: true }), 201);
});

auth.post("/login", async (c) => {
  const ip = clientIp(c);
  const rl = await rateLimit(c.env.KV, `login:${ip}`, 10, 900);
  if (!rl.allowed) throw new AppError("Too many attempts", 429, "RATE_LIMIT");

  const body = await validateJson(c, credsSchema);
  if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.turnstileToken))) {
    throw new AppError("Captcha failed", 400, "CAPTCHA");
  }

  const d = db(c.env.DB);
  const user = await d.select().from(users).where(eq(users.email, body.email)).get();
  // Always run a verify to reduce user-enumeration timing differences.
  const valid = user
    ? await verifyPassword(body.password, user.passwordSalt, user.passwordHash)
    : await verifyPassword(
        body.password,
        "AAAAAAAAAAAAAAAAAAAAAA==",
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      );
  if (!user || !valid || user.status !== 1) {
    throw new AppError("Invalid credentials", 401, "AUTH");
  }

  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const { access, refresh } = await issueTokens(c, user.id, isAdmin, user.roleId);
  setAuthCookies(c, access, refresh);
  return c.json(ok({ userId: user.id, admin: isAdmin }));
});

auth.post("/refresh", async (c) => {
  const token = getCookie(c, REFRESH_COOKIE);
  if (!token) throw new AppError("Not authenticated", 401, "AUTH");
  const payload = await verifyJwt(c.env.JWT_SECRET, token);
  if (!payload || payload.typ !== "refresh") throw new AppError("Invalid token", 401, "AUTH");

  const userId = Number(payload.sub);
  const sid = String(payload.sid ?? "");
  const session = await getSession(c.env.KV, userId, sid);
  if (!session) throw new AppError("Session revoked", 401, "AUTH");

  const d = db(c.env.DB);
  const user = await d.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.status !== 1) throw new AppError("Invalid user", 401, "AUTH");

  // Rotate: revoke old sid, issue fresh tokens (new sid).
  await revokeSession(c.env.KV, userId, sid);
  const isAdmin = user.email === c.env.ADMIN_EMAIL;
  const { access, refresh } = await issueTokens(c, user.id, isAdmin, user.roleId);
  setAuthCookies(c, access, refresh);
  return c.json(ok({ refreshed: true }));
});

auth.post("/logout", requireAuth(), async (c) => {
  const { userId, sid } = c.get("auth");
  await revokeSession(c.env.KV, userId, sid);
  clearAuthCookies(c);
  return c.json(ok({ loggedOut: true }));
});

auth.get("/me", requireAuth(), async (c) => {
  const { userId, adm, roleId } = c.get("auth");
  return c.json(ok({ userId, admin: adm, roleId }));
});
