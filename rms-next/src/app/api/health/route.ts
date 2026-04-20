import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getRequestId } from "@/lib/http/request-id";
import { logInfo } from "@/lib/observability/structured-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * GET /api/health — parity with FastAPI `GET /api/health` in `main.py`:
 * 200 + `{ status, database }` when DB answers `SELECT 1`, else 503.
 */
export async function GET(req: Request) {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    logInfo("health_ok", { database: "connected" }, req);
    const res = NextResponse.json({
      status: "ok",
      database: "connected",
    });
    const reqId = getRequestId(req);
    if (reqId) res.headers.set("x-request-id", reqId);
    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    const reqId = getRequestId(req);
    console.error("[GET /api/health]", reqId ? { requestId: reqId } : {}, e);
    const res = NextResponse.json(
      {
        status: "unhealthy",
        database: "unreachable",
        ...(isProd() ? {} : { detail }),
        ...(reqId ? { request_id: reqId } : {}),
      },
      { status: 503 },
    );
    if (reqId) res.headers.set("x-request-id", reqId);
    return res;
  }
}
