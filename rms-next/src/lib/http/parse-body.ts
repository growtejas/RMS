import { z } from "zod";

import { fail, jsonResponse, type ApiResponse } from "./envelope";

function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`)
    .join("; ");
}

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Parse JSON body and validate with Zod. Returns a Response on failure (422 / 400).
 */
export async function parseJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<ParseResult<z.infer<T>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonResponse(fail("Invalid or empty JSON body"), 400),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse<null>(fail(zodMessage(parsed.error)), 422),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Wrap a service result; map thrown errors to envelope (500 unless Error with status).
 */
export async function runService<T>(
  fn: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  try {
    return await fn();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "An unexpected error occurred";
    return fail(message);
  }
}
