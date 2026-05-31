import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { Env } from "../env";
import { AppError } from "./errors";
import { verifyJwt } from "../auth/jwt";
import { getSession } from "../auth/session";
import { db } from "../db/client";
import { userPermissions } from "../auth/rbac";
import { ACCESS_COOKIE } from "./cookies";

export interface AuthContext {
  userId: number;
  sid: string;
  adm: boolean;
  roleId: number;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

export function requireAuth() {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const token = getCookie(c, ACCESS_COOKIE);
    if (!token) throw new AppError("Not authenticated", 401, "AUTH");

    const payload = await verifyJwt(c.env.JWT_SECRET, token);
    if (!payload) throw new AppError("Invalid token", 401, "AUTH");

    const userId = Number(payload.sub);
    const sid = String(payload.sid ?? "");
    const session = await getSession(c.env.KV, userId, sid);
    if (!session) throw new AppError("Session revoked", 401, "AUTH");

    c.set("auth", {
      userId,
      sid,
      adm: payload.adm === true,
      roleId: Number(payload.role ?? 0),
    });
    await next();
  });
}

export function requirePermission(permission: string) {
  return createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const auth = c.get("auth");
    if (!auth) throw new AppError("Not authenticated", 401, "AUTH");
    if (auth.adm) return await next(); // admin bypass
    const perms = await userPermissions(db(c.env.DB), auth.roleId);
    if (!perms.includes(permission)) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    await next();
  });
}
