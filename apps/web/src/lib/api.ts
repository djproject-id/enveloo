// ---------------------------------------------------------------------------
// Typed fetch wrapper for the Enveloo API
// All requests use credentials: "include" (cookie-based auth — no tokens in JS)
// ---------------------------------------------------------------------------

export interface ApiSuccessEnvelope<T> {
  success: true
  data: T
}

export interface ApiErrorEnvelope {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  const res = await fetch(path, init)

  // Try to parse JSON envelope regardless of HTTP status
  let envelope: ApiEnvelope<T>
  try {
    envelope = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError('PARSE_ERROR', `Unexpected response from server (${res.status})`, res.status)
  }

  if (!envelope.success) {
    throw new ApiError(envelope.error.code, envelope.error.message, res.status)
  }

  if (!res.ok) {
    // success: true but non-2xx — should not happen, but guard anyway
    throw new ApiError('HTTP_ERROR', `HTTP ${res.status}`, res.status)
  }

  return envelope.data
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path)
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body)
  },
  del<T>(path: string, body?: unknown): Promise<T> {
    return request<T>('DELETE', path, body)
  },
}
