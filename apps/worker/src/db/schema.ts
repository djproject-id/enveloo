import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  isDefault: integer("is_default").notNull().default(0),
});

export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
});

export const rolePermissions = sqliteTable("role_permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: integer("role_id").notNull(),
  permissionId: integer("permission_id").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  roleId: integer("role_id").notNull(),
  status: integer("status").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

export const inviteKeys = sqliteTable("invite_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  roleId: integer("role_id").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  userId: integer("user_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id").notNull(),
  userId: integer("user_id").notNull(),
  fromAddress: text("from_address").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  toAddress: text("to_address").notNull().default(""),
  subject: text("subject").notNull().default(""),
  html: text("html").notNull().default(""),
  text: text("text").notNull().default(""),
  unread: integer("unread").notNull().default(1),
  direction: text("direction").notNull().default("received"),
  createdAt: integer("created_at").notNull(),
});

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  emailId: integer("email_id").notNull(),
  userId: integer("user_id").notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull().default("attachment"),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
