import { fail, type Fail } from "./result";

export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function toErrorResponse(err: unknown): { status: number; body: Fail } {
  if (err instanceof AppError) {
    return { status: err.status, body: fail(err.message, err.code) };
  }
  // Never leak internal error text to clients.
  return { status: 500, body: fail("Internal error", "INTERNAL") };
}
