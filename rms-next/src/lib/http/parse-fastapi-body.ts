import { NextResponse } from "next/server";
import type { z } from "zod";

function zodDetail(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`)
    .join("; ");
}

/**
 * Parse JSON and validate with Zod; return `{ detail }` responses on failure (FastAPI-shaped).
 */
export async function parseFastapiJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { detail: "Invalid or empty JSON body" },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ detail: zodDetail(parsed.error) }, { status: 422 }),
    };
  }

  return { ok: true, data: parsed.data };
}
