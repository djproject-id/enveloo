export interface Session {
  userId: number;
  createdAt: number;
}

function sessionKey(userId: number, sid: string): string {
  return `session:${userId}:${sid}`;
}

export async function createSession(
  kv: KVNamespace,
  userId: number,
  sid: string,
  ttlSeconds: number,
): Promise<void> {
  const value: Session = { userId, createdAt: Math.floor(Date.now() / 1000) };
  await kv.put(sessionKey(userId, sid), JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function getSession(
  kv: KVNamespace,
  userId: number,
  sid: string,
): Promise<Session | null> {
  return await kv.get<Session>(sessionKey(userId, sid), "json");
}

export async function revokeSession(kv: KVNamespace, userId: number, sid: string): Promise<void> {
  await kv.delete(sessionKey(userId, sid));
}
