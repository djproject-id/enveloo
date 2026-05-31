import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ingestEmail } from "../src/email/receive";
import { db } from "../src/db/client";
import { accounts, emails } from "../src/db/schema";
import { eq } from "drizzle-orm";

const RAW = [
  "From: Bob <bob@example.com>",
  "To: inbox@mydomain.com",
  "Subject: Test",
  "MIME-Version: 1.0",
  "Content-Type: text/html; charset=utf-8",
  "",
  '<p onclick="x()">Body<script>alert(1)</script></p>',
  "",
].join("\r\n");

beforeEach(async () => {
  await env.DB.exec("DELETE FROM attachments");
  await env.DB.exec("DELETE FROM emails");
  await env.DB.exec("DELETE FROM accounts");
});

describe("ingestEmail", () => {
  it("stores a sanitized email for a known recipient", async () => {
    const d = db(env.DB);
    await d.insert(accounts).values({ email: "inbox@mydomain.com", userId: 1, createdAt: 0 }).run();

    const stored = await ingestEmail(env, "inbox@mydomain.com", RAW);
    expect(stored).toBe(true);

    const row = await d.select().from(emails).where(eq(emails.userId, 1)).get();
    expect(row?.subject).toBe("Test");
    expect(row?.html).toContain("Body");
    expect(row?.html.toLowerCase()).not.toContain("<script");
    expect(row?.html).not.toContain("onclick");
  });

  it("drops mail for an unknown recipient", async () => {
    const stored = await ingestEmail(env, "nobody@mydomain.com", RAW);
    expect(stored).toBe(false);
  });
});
