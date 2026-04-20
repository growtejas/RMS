import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { parseFastapiJsonBody } from "@/lib/http/parse-fastapi-body";
import { removeLocation, updateLocation } from "@/lib/services/reference-write-service";
import { locationUpdateBody } from "@/lib/validators/reference-master";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { locationId: string } };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const locationId = Number.parseInt(params.locationId, 10);
    if (!Number.isFinite(locationId)) {
      return NextResponse.json({ detail: "Invalid location id" }, { status: 422 });
    }

    const parsed = await parseFastapiJsonBody(request, locationUpdateBody);
    if (!parsed.ok) {
      return parsed.response;
    }

    const body = await updateLocation(user.userId, locationId, {
      city: parsed.data.city,
      country: parsed.data.country,
    });
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[PATCH /api/locations/[locationId]]");
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Admin", "Owner", "HR");
    if (denied) {
      return denied;
    }

    const locationId = Number.parseInt(params.locationId, 10);
    if (!Number.isFinite(locationId)) {
      return NextResponse.json({ detail: "Invalid location id" }, { status: 422 });
    }

    const body = await removeLocation(user.userId, locationId);
    return NextResponse.json(body);
  } catch (e) {
    return referenceWriteCatch(e, "[DELETE /api/locations/[locationId]]");
  }
}
