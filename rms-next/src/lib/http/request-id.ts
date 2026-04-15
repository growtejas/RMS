export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

export function getRequestId(req: Request): string | null {
  return req.headers.get(REQUEST_ID_HEADER) ?? null;
}

