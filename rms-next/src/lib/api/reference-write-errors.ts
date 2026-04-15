import { NextResponse } from "next/server";

import { HttpError } from "@/lib/http/http-error";
import { logError } from "@/lib/logging/logger";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function referenceWriteCatch(
  e: unknown,
  logLabel: string,
  requestIdOrReq?: string | null | Request,
): NextResponse {
  const requestId =
    typeof requestIdOrReq === "string" || requestIdOrReq == null
      ? requestIdOrReq
      : requestIdOrReq.headers.get("x-request-id");

  if (e instanceof HttpError) {
    return NextResponse.json({ detail: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : "";
  if (message.includes("DATABASE_URL")) {
    return NextResponse.json(
      { detail: "Server misconfigured: database connection" },
      { status: 503 },
    );
  }
  logError(logLabel, e, requestId ? { request_id: requestId } : undefined);
  const res = NextResponse.json(
    {
      detail: "Internal server error",
      ...(isProd() ? {} : { debug: message || undefined }),
      ...(requestId ? { request_id: requestId } : {}),
    },
    { status: 500 },
  );
  if (requestId) {
    res.headers.set("x-request-id", requestId);
  }
  return res;
}
