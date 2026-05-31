import { describe, it, expect } from "vitest";
import { parseEmail } from "../src/email/parse";

const RAW = [
  "From: Alice <alice@example.com>",
  "To: inbox@mydomain.com",
  "Subject: Hello",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b1"',
  "",
  "--b1",
  "Content-Type: text/html; charset=utf-8",
  "",
  "<p>Hi there</p>",
  "--b1",
  'Content-Type: text/plain; name="note.txt"',
  'Content-Disposition: attachment; filename="note.txt"',
  "",
  "hello attachment",
  "--b1--",
  "",
].join("\r\n");

describe("parseEmail", () => {
  it("extracts headers, html body, and attachments", async () => {
    const p = await parseEmail(RAW);
    expect(p.fromAddress).toBe("alice@example.com");
    expect(p.subject).toBe("Hello");
    expect(p.html).toContain("Hi there");
    expect(p.attachments.length).toBe(1);
    expect(p.attachments[0]!.filename).toBe("note.txt");
  });
});
