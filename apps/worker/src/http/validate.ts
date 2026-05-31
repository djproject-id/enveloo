import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

export async function validateJson<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError("Invalid JSON body", 422, "VALIDATION");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("Validation failed", 422, "VALIDATION");
  }
  return parsed.data;
}
