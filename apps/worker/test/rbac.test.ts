import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { db } from "../src/db/client";
import { seedRbac, defaultRoleId, userPermissions } from "../src/auth/rbac";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM role_permissions");
  await env.DB.exec("DELETE FROM permissions");
  await env.DB.exec("DELETE FROM roles");
});

describe("rbac", () => {
  it("seeds a default role with base permissions (idempotent)", async () => {
    const d = db(env.DB);
    await seedRbac(d);
    await seedRbac(d); // second call must not duplicate
    const roleId = await defaultRoleId(d);
    expect(roleId).toBeGreaterThan(0);
    const perms = await userPermissions(d, roleId);
    expect(perms.sort()).toEqual(["account:manage", "email:read", "email:send"]);
  });

  it("returns no permissions for an unknown role", async () => {
    const d = db(env.DB);
    await seedRbac(d);
    expect(await userPermissions(d, 9999)).toEqual([]);
  });
});
