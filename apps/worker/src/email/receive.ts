import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { db } from "../db/client";
import { accounts, emails, attachments } from "../db/schema";
import { parseEmail } from "./parse";
import { sanitizeEmailHtml } from "./sanitize";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

async function storeAttachment(r2: R2Bucket, data: ArrayBuffer, mimeType: string): Promise<string> {
  const key = `att/${crypto.randomUUID()}`;
  await r2.put(key, data, { httpMetadata: { contentType: mimeType } });
  return key;
}

export async function ingestEmail(
  env: Env,
  recipient: string,
  raw: ArrayBuffer | string,
): Promise<boolean> {
  const to = recipient.toLowerCase();
  const d = db(env.DB);
  const account = await d.select().from(accounts).where(eq(accounts.email, to)).get();
  if (!account) return false;

  const parsed = await parseEmail(raw);
  const safeHtml = parsed.html ? await sanitizeEmailHtml(parsed.html) : "";
  const now = Math.floor(Date.now() / 1000);

  const inserted = await d
    .insert(emails)
    .values({
      accountId: account.id,
      userId: account.userId,
      fromAddress: parsed.fromAddress,
      fromName: parsed.fromName,
      toAddress: to,
      subject: parsed.subject,
      html: safeHtml,
      text: parsed.text,
      unread: 1,
      createdAt: now,
    })
    .returning({ id: emails.id });

  const emailId = inserted[0]!.id;

  for (const att of parsed.attachments) {
    if (att.content.byteLength > MAX_ATTACHMENT_BYTES) continue;
    const key = await storeAttachment(env.R2, att.content, att.mimeType);
    await d
      .insert(attachments)
      .values({
        emailId,
        userId: account.userId,
        r2Key: key,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.content.byteLength,
        createdAt: now,
      })
      .run();
  }
  return true;
}
