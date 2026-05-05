import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { log } from "@/lib/logging/logger";
import { enqueueCieIntelligenceJob } from "@/lib/queue/cie-intelligence-queue";
import {
  insertBulkImportJob,
  markBulkImportJobRunning,
} from "@/lib/repositories/bulk-import-repo";
import { filterCandidateIdsInOrganization } from "@/lib/repositories/candidates-repo";
import { initCieBulkRedisTracking } from "@/lib/services/cie/candidate-intelligence-service";
import { cieRecomputeBody } from "@/lib/validators/cie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/candidates/recompute — queue CIE report generation (bulk). */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const parsed = await parseJsonBody(req, cieRecomputeBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const uniqueIds = Array.from(new Set(parsed.data.candidateIds));
    const valid = await filterCandidateIdsInOrganization(uniqueIds, user.organizationId);
    if (valid.length === 0) {
      return NextResponse.json(
        { detail: "No matching candidates in organization" },
        { status: 422 },
      );
    }

    const bulkJobId = await insertBulkImportJob({
      organizationId: user.organizationId,
      kind: "cie_recompute",
      payload: {
        candidate_ids: valid,
        force: parsed.data.force ?? false,
      },
      createdBy: user.userId,
    });
    if (!bulkJobId) {
      return NextResponse.json({ detail: "Failed to create bulk job" }, { status: 500 });
    }

    await markBulkImportJobRunning(bulkJobId);
    try {
      await initCieBulkRedisTracking(bulkJobId, valid.length);
    } catch {
      /* Redis optional in dev */
    }

    const force = parsed.data.force ?? false;
    let enqueued = 0;
    const enqueueErrors: string[] = [];
    for (const candidateId of valid) {
      try {
        await enqueueCieIntelligenceJob({
          organizationId: user.organizationId,
          candidateId,
          force,
          triggeredByUserId: user.userId,
          bulkJobId,
        });
        enqueued++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        enqueueErrors.push(`${candidateId}: ${msg}`);
        log("error", "cie_enqueue_failed", {
          candidate_id: candidateId,
          bulk_job_id: bulkJobId,
          error: msg,
        });
      }
    }

    if (enqueued === 0 && valid.length > 0) {
      return NextResponse.json(
        {
          detail:
            "Could not queue CIE jobs. Is Redis running and REDIS_URL set? Start the worker: npm run worker:cie-intelligence",
          errors: enqueueErrors.slice(0, 8),
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        bulk_job_id: bulkJobId,
        queued: enqueued,
        enqueue_failed: valid.length - enqueued,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/candidates/recompute]");
  }
}
