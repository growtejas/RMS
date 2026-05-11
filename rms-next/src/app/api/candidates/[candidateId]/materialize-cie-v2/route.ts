import { NextResponse } from "next/server";
import { z } from "zod";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { enqueueCieIntelligenceJob } from "@/lib/queue/cie-intelligence-queue";
import { log } from "@/lib/logging/logger";
import { materializeCandidateCieV2Snapshot } from "@/lib/services/cie/candidate-intelligence-service";
import { materializeCieV2Body } from "@/lib/validators/cie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { candidateId: string } };

function parseId(s: string): number | NextResponse {
  const id = Number.parseInt(s, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ detail: "Invalid candidate id" }, { status: 422 });
  }
  return id;
}

function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`)
    .join("; ");
}

function readRecomputeQuery(req: Request): boolean {
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get("recompute");
    if (v == null) return false;
    const t = v.trim().toLowerCase();
    return t === "1" || t === "true" || t === "yes";
  } catch {
    return false;
  }
}

/**
 * POST /api/candidates/{id}/materialize-cie-v2
 * Runs strict resume v2 from cached resume text, maps to ParsedCandidate, writes parsed_json + parsed_v2_json.
 * Optional JSON body: `{ "enqueue_cie_recompute": true }` or query `?recompute=1` to queue a forced CIE job.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const candidateId = parseId(params.candidateId);
    if (candidateId instanceof NextResponse) {
      return candidateId;
    }

    const rawBodyText = await req.text();
    let enqueueFromBody = false;
    if (rawBodyText.trim()) {
      let raw: unknown;
      try {
        raw = JSON.parse(rawBodyText);
      } catch {
        return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
      }
      const parsed = materializeCieV2Body.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json({ detail: zodMessage(parsed.error) }, { status: 422 });
      }
      enqueueFromBody = parsed.data.enqueue_cie_recompute ?? false;
    }

    const enqueueRecompute = readRecomputeQuery(req) || enqueueFromBody;

    const result = await materializeCandidateCieV2Snapshot({
      organizationId: user.organizationId,
      candidateId,
    });

    if (!result.ok) {
      if (result.reason === "candidate_not_found") {
        return NextResponse.json({ detail: "Candidate not found" }, { status: 404 });
      }
      const status =
        result.reason === "no_resume_text" ||
        result.reason.startsWith("v2_failed:") ||
        result.reason.startsWith("v2_map_failed:")
          ? 422
          : 500;
      return NextResponse.json({ detail: result.reason }, { status });
    }

    let cieRecompute: "skipped" | "queued" | "failed" = "skipped";
    let cieRecomputeError: string | null = null;

    if (enqueueRecompute) {
      try {
        await enqueueCieIntelligenceJob({
          organizationId: user.organizationId,
          candidateId,
          force: true,
          triggeredByUserId: user.userId,
          bulkJobId: null,
        });
        cieRecompute = "queued";
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        cieRecompute = "failed";
        cieRecomputeError = msg;
        log("error", "cie_materialize_enqueue_failed", {
          candidate_id: candidateId,
          error: msg,
        });
      }
    }

    return NextResponse.json({
      snapshot_id: result.snapshotId,
      version: result.version,
      cie_recompute: cieRecompute,
      ...(cieRecomputeError ? { cie_recompute_error: cieRecomputeError } : {}),
    });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/candidates/[candidateId]/materialize-cie-v2]");
  }
}
