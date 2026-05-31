export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  const current = Number((await kv.get(k)) ?? "0");
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(k, String(current + 1), { expirationTtl: windowSeconds });
  return { allowed: true, remaining: limit - current - 1 };
}
