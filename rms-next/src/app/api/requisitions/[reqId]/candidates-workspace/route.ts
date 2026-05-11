import { NextResponse } from "next/server";

import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { envelopeOk } from "@/lib/http/api-envelope";
import { HttpError } from "@/lib/http/http-error";
import { estimateJsonBytes, withRequestPerf } from "@/lib/perf/request-perf";
import { listRequisitionCandidatesWorkspaceJson } from "@/lib/services/requisition-candidates-workspace-service";
import { parseRequisitionCandidatesWorkspaceQuery } from "@/lib/validators/requisition-candidates-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { reqId: string } };

function parseReqId(params: { reqId: string }): number | NextResponse {
  const reqId = Number.parseInt(params.reqId, 10);
  if (!Number.isFinite(reqId)) {
    return NextResponse.json({ detail: "Invalid requisition id" }, { status: 422 });
  }
  return reqId;
}

/**
 * GET /api/requisitions/{reqId}/candidates-workspace — paginated TA roster + embedded lifecycle.
 *
 * Returns the canonical paginated envelope augmented with `facets`:
 *   `{ success, data: { items, pagination, facets }, error }`.
 *
 * Pagination params: `page` (>=1, default 1), `limit` (25 / 50 / 100, default 25).
 * Legacy `page_size` is still accepted for backwards compatibility.
 */
export async function GET(req: Request, { params }: Ctx) {
  return withRequestPerf("GET /api/requisitions/[reqId]/candidates-workspace", async () => {
    try {
      const user = await requireBearerUser(req);
      if (user instanceof NextResponse) {
        return user;
      }
      const denied = requireAnyRole(
        user,
        "Manager",
        "Admin",
        "HR",
        "Employee",
        "TA",
      );
      if (denied) {
        return denied;
      }

      const reqId = parseReqId(params);
      if (reqId instanceof NextResponse) {
        return reqId;
      }

      let q: ReturnType<typeof parseRequisitionCandidatesWorkspaceQuery>;
      try {
        q = parseRequisitionCandidatesWorkspaceQuery(new URL(req.url));
      } catch (e) {
        if (e instanceof HttpError) {
          return NextResponse.json({ detail: e.message }, { status: e.status });
        }
        throw e;
      }

      const data = await listRequisitionCandidatesWorkspaceJson({
        organizationId: user.organizationId,
        requisitionId: reqId,
        query: q,
      });

      return envelopeOk(data, {
        headers: {
          "x-rms-perf-payload-bytes": String(estimateJsonBytes(data)),
        },
      });
    } catch (e) {
      return referenceWriteCatch(e, "[GET /api/requisitions/[reqId]/candidates-workspace]");
    }
  });
}
