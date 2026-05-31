export interface Ok<T> { success: true; data: T; }
export interface Fail { success: false; error: { code: string; message: string }; }

export function ok<T>(data: T): Ok<T> {
  return { success: true, data };
}

export function fail(message: string, code = "ERROR"): Fail {
  return { success: false, error: { code, message } };
}
