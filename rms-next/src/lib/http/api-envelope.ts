import { NextResponse } from "next/server";

import { HttpError } from "@/lib/http/http-error";
import { logError, unwrapErrorCauses } from "@/lib/logging/logger";

export type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  error: null;
};

export type ApiErrorEnvelope = {
  success: false;
  data: null;
  error: string;
};

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export function envelopeOk<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiSuccessEnvelope<T> = { success: true, data, error: null };
  return NextResponse.json(body, init ?? { status: 200 });
}

export function envelopeFail(
  error: string,
  status: number,
  init?: ResponseInit,
): NextResponse {
  const body: ApiErrorEnvelope = { success: false, data: null, error };
  return NextResponse.json(body, init ?? { status });
}

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Error handler for routes that use `{ success, data, error }`. */
export function envelopeCatch(e: unknown, logLabel: string): NextResponse {
  if (e instanceof HttpError) {
    return envelopeFail(e.message, e.status);
  }
  const message = e instanceof Error ? e.message : "";
  if (message.includes("DATABASE_URL")) {
    return envelopeFail("Server misconfigured: database connection", 503);
  }
  logError(logLabel, e);
  const chain = !isProd() ? unwrapErrorCauses(e, 8) : [];
  const devDetail =
    chain.length > 0 ? chain.filter(Boolean).join(" → ") : message;
  return envelopeFail(
    isProd() ? "Internal server error" : devDetail || "Internal server error",
    500,
  );
}
