import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseJsonBody } from "@/lib/http/parse-body";
import { log } from "@/lib/logging/logger";
import { enqueueCieRematerializeJob } from "@/lib/queue/cie-intelligence-queue";
import {
  insertBulkImportJob,
  markBulkImportJobRunning,
} from "@/lib/repositories/bulk-import-repo";
import { filterCandidateIdsInOrganization } from "@/lib/repositories/candidates-repo";
import { initCieBulkRedisTracking } from "@/lib/services/cie/candidate-intelligence-service";
import { cieRematerializeV2Body } from "@/lib/validators/cie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cie/candidates/rematerialize — bulk re-materialize the canonical strict_resume_v2
 * snapshot for the given candidates and (optionally) enqueue a follow-up CIE recompute per id.
 */
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

    const parsed = await parseJsonBody(req, cieRematerializeV2Body);
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

    const enqueueRecompute = parsed.data.enqueueRecompute ?? true;

    const bulkJobId = await insertBulkImportJob({
      organizationId: user.organizationId,
      kind: "cie_rematerialize_v2",
      payload: {
        candidate_ids: valid,
        enqueue_recompute: enqueueRecompute,
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

    let enqueued = 0;
    const enqueueErrors: string[] = [];
    for (const candidateId of valid) {
      try {
        await enqueueCieRematerializeJob({
          organizationId: user.organizationId,
          candidateId,
          triggeredByUserId: user.userId,
          bulkJobId,
          enqueueRecompute,
        });
        enqueued++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        enqueueErrors.push(`${candidateId}: ${msg}`);
        log("error", "cie_rematerialize_enqueue_failed", {
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
            "Could not queue CIE rematerialize jobs. Is Redis running and REDIS_URL set? Start the worker: npm run worker:cie-intelligence",
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
    return referenceWriteCatch(e, "[POST /api/cie/candidates/rematerialize]");
  }
}
