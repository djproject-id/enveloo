import PostalMime from "postal-mime";

export interface ParsedAttachment {
  filename: string;
  mimeType: string;
  content: ArrayBuffer;
}

export interface ParsedEmail {
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  html: string;
  text: string;
  attachments: ParsedAttachment[];
}

function toArrayBuffer(content: ArrayBuffer | Uint8Array | string): ArrayBuffer {
  if (typeof content === "string") {
    return new TextEncoder().encode(content).buffer as ArrayBuffer;
  }
  if (content instanceof Uint8Array) {
    return content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    ) as ArrayBuffer;
  }
  return content;
}

export async function parseEmail(raw: ArrayBuffer | string): Promise<ParsedEmail> {
  const email = await PostalMime.parse(raw);
  return {
    fromAddress: email.from?.address ?? "",
    fromName: email.from?.name ?? "",
    toAddress: email.to?.[0]?.address ?? "",
    subject: email.subject ?? "",
    html: email.html ?? "",
    text: email.text ?? "",
    attachments: (email.attachments ?? []).map((a) => ({
      filename: a.filename ?? "attachment",
      mimeType: a.mimeType ?? "application/octet-stream",
      content: toArrayBuffer(a.content),
    })),
  };
}
