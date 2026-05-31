import { eq } from "drizzle-orm";
import type { db as makeDb } from "../db/client";
import { roles, permissions, rolePermissions } from "../db/schema";

type DB = ReturnType<typeof makeDb>;

export const BASE_PERMISSIONS = ["email:read", "email:send", "account:manage"] as const;

export async function seedRbac(d: DB): Promise<void> {
  let role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  if (!role) {
    await d.insert(roles).values({ name: "user", isDefault: 1 }).run();
    role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  }
  const roleId = role!.id;

  for (const key of BASE_PERMISSIONS) {
    let perm = await d.select().from(permissions).where(eq(permissions.key, key)).get();
    if (!perm) {
      await d.insert(permissions).values({ key }).run();
      perm = await d.select().from(permissions).where(eq(permissions.key, key)).get();
    }
    const link = await d
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, perm!.id))
      .get();
    if (!link) {
      await d.insert(rolePermissions).values({ roleId, permissionId: perm!.id }).run();
    }
  }
}

export async function defaultRoleId(d: DB): Promise<number> {
  const role = await d.select().from(roles).where(eq(roles.isDefault, 1)).get();
  return role?.id ?? 0;
}

export async function userPermissions(d: DB, roleId: number): Promise<string[]> {
  const rows = await d
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId))
    .all();
  return rows.map((r) => r.key);
}
