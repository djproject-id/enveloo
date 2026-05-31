import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const ACCESS_TTL = 900;
export const REFRESH_TTL = 604800;

export function setAuthCookies(c: Context, access: string, refresh: string): void {
  setCookie(c, ACCESS_COOKIE, access, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: ACCESS_TTL,
  });
  setCookie(c, REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/api/auth",
    maxAge: REFRESH_TTL,
  });
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/api/auth" });
}
