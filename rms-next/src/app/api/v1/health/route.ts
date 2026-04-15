import { ok, jsonResponse } from "@/lib/http/envelope";

/**
 * Versioned API entrypoint (v1). Add modules under `app/api/v1/<module>/route.ts`.
 * Frontend can migrate from FastAPI (`/api/...`) to these routes incrementally.
 */
export async function GET() {
  return jsonResponse(
    ok({
      service: "rms-next-api",
      version: "v1",
      time: new Date().toISOString(),
    }),
  );
}
