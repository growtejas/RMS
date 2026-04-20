import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { parseJsonBody } from "@/lib/http/parse-body";
import { allowPublicRequest } from "@/lib/security/public-rate-limit";
import { acknowledgeInboundEvent, resolveExternalId } from "@/lib/services/inbound-events-service";
import { publicApplyIngestBody } from "@/lib/validators/inbound-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { slug: string } };

function parseSlug(raw: string): string | null {
  const slug = raw.trim();
  if (!slug) {
    return null;
  }
  return slug;
}

/** POST /api/public/apply/[slug] — persist inbound event and return async ack. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "unknown";
    if (!allowPublicRequest(`public_apply:${ip}`)) {
      return NextResponse.json({ detail: "Rate limit exceeded" }, { status: 429 });
    }

    const slug = parseSlug(params.slug);
    if (!slug) {
      return NextResponse.json({ detail: "Invalid job slug" }, { status: 422 });
    }

    const parsed = await parseJsonBody(req, publicApplyIngestBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const externalId = resolveExternalId({
      source: "public_apply",
      candidates: [
        parsed.data.external_id,
        parsed.data.applicant.email,
        `${slug}:${parsed.data.applicant.email}`,
      ],
    });

    const ack = await acknowledgeInboundEvent({
      source: "public_apply",
      externalId,
      payload: {
        ...parsed.data,
        job_slug: slug,
      },
    });

    return NextResponse.json(ack, { status: 202 });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/public/apply/[slug]]");
  }
}
