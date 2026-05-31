const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendInput {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendResult {
  id: string;
}

export async function sendViaResend(
  apiKey: string,
  input: SendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed with status ${res.status}`);
  }
  const data = (await res.json()) as { id?: string };
  return { id: data.id ?? "" };
}
