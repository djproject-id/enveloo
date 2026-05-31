import { describe, it, expect } from "vitest";
import { sendViaResend } from "../src/email/send";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("sendViaResend", () => {
  it("returns the message id on success", async () => {
    const r = await sendViaResend(
      "key",
      { from: "a@x.com", to: "b@y.com", subject: "Hi", text: "yo" },
      fakeFetch(200, { id: "msg_123" }),
    );
    expect(r.id).toBe("msg_123");
  });

  it("throws on a non-2xx response", async () => {
    await expect(
      sendViaResend(
        "key",
        { from: "a@x.com", to: "b@y.com", subject: "Hi", text: "yo" },
        fakeFetch(422, { message: "bad" }),
      ),
    ).rejects.toThrow();
  });
});
