import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { envelopeCatch, envelopeFail, envelopeOk } from "@/lib/http/api-envelope";
import { estimateJsonBytes, withRequestPerf } from "@/lib/perf/request-perf";
import { getApplicationLifecycle } from "@/lib/services/interview-lifecycle-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { applicationId: string } };

/** GET /api/applications/{applicationId}/lifecycle */
export async function GET(req: Request, { params }: Ctx) {
  return withRequestPerf("GET /api/applications/[applicationId]/lifecycle", async () => {
    try {
      const user = await requireBearerUser(req);
      if (user instanceof NextResponse) {
        return user;
      }
      const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
      if (denied) {
        return denied;
      }

      const applicationId = Number.parseInt(params.applicationId, 10);
      if (!Number.isFinite(applicationId)) {
        return envelopeFail("Invalid application id", 422);
      }

      const data = await getApplicationLifecycle(applicationId, user.organizationId);
      const res = envelopeOk(data);
      res.headers.set("x-rms-perf-payload-bytes", String(estimateJsonBytes(data)));
      return res;
    } catch (e) {
      return envelopeCatch(e, "[GET /api/applications/[applicationId]/lifecycle]");
    }
  });
}
