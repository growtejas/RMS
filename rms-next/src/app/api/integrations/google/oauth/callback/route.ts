import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Placeholder callback; exchange code → tokens in a future Auth.js / custom handler. */
export async function GET() {
  return NextResponse.json({ detail: "Not implemented — use server-side OAuth exchange" }, {
    status: 501,
  });
}
