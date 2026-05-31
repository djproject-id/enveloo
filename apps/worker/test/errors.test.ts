import { describe, it, expect } from "vitest";
import { ok, fail } from "../src/http/result";
import { AppError, toErrorResponse } from "../src/http/errors";

describe("result envelope", () => {
  it("wraps success data", () => {
    expect(ok({ a: 1 })).toEqual({ success: true, data: { a: 1 } });
  });
  it("wraps an error message and code", () => {
    expect(fail("nope", "BAD")).toEqual({
      success: false,
      error: { code: "BAD", message: "nope" },
    });
  });
});

describe("AppError", () => {
  it("carries status and code", () => {
    const e = new AppError("forbidden", 403, "FORBIDDEN");
    expect(e.status).toBe(403);
    expect(e.code).toBe("FORBIDDEN");
  });
  it("maps AppError to a fail envelope + status", () => {
    const r = toErrorResponse(new AppError("nope", 401, "AUTH"));
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: { code: "AUTH", message: "nope" } });
  });
  it("maps unknown errors to 500 without leaking the message", () => {
    const r = toErrorResponse(new Error("db password is hunter2"));
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe("Internal error");
    expect(JSON.stringify(r.body)).not.toContain("hunter2");
  });
});
