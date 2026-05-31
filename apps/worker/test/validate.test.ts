import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Hono } from "hono";
import { validateJson } from "../src/http/validate";
import { AppError } from "../src/http/errors";

const schema = z.object({ email: z.string().email() });

function app() {
  const a = new Hono();
  a.post("/x", async (c) => {
    const body = await validateJson(c, schema);
    return c.json({ email: body.email });
  });
  a.onError((err, c) => {
    if (err instanceof AppError) return c.json({ code: err.code }, err.status as 400);
    return c.json({ code: "INTERNAL" }, 500);
  });
  return a;
}

describe("validateJson", () => {
  it("returns parsed body for valid input", async () => {
    const res = await app().request("/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.com" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: "a@b.com" });
  });

  it("throws AppError 422 for invalid input", async () => {
    const res = await app().request("/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ code: "VALIDATION" });
  });
});
