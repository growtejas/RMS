import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  resumeLocalFilePath,
  resumeMediaType,
} from "@/lib/storage/resume-local-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { filename: string } };

/** GET /api/uploads/resume/{filename} — parity with FastAPI download_resume. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin", "Manager");
    if (denied) {
      return denied;
    }

    const { filename } = params;
    const filePath = resumeLocalFilePath(filename);
    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json(
        { detail: "Resume file not found" },
        { status: 404 },
      );
    }

    const mediaType = resumeMediaType(filename);
    const stream = createReadStream(filePath);
    const body = Readable.toWeb(stream) as unknown as ReadableStream;
    return new NextResponse(body, {
      headers: {
        "Content-Type": mediaType,
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (e) {
    return referenceWriteCatch(e, "[GET /api/uploads/resume/[filename]]");
  }
}
