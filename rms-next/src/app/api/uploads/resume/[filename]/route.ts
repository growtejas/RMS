import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireBearerUser } from "@/lib/auth/api-guard";
import { rolesMatchAny } from "@/lib/auth/normalize-roles";
import { selectCandidateById, selectInterviewById } from "@/lib/repositories/candidates-repo";
import { userIsPanelistForInterview } from "@/lib/repositories/interviews-repo";
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

    const staffOk = rolesMatchAny(user.roles, ["TA", "HR", "Admin", "Manager", "Owner"]);
    let resumeAccessOk = staffOk;

    if (!resumeAccessOk && rolesMatchAny(user.roles, ["Interviewer"])) {
      const interviewIdRaw = new URL(req.url).searchParams.get("interview_id");
      if (!interviewIdRaw) {
        return NextResponse.json(
          { detail: "interview_id query parameter is required for interviewer resume access" },
          { status: 422 },
        );
      }
      const interviewId = Number.parseInt(interviewIdRaw, 10);
      if (!Number.isFinite(interviewId)) {
        return NextResponse.json({ detail: "Invalid interview_id" }, { status: 422 });
      }
      const panelOk = await userIsPanelistForInterview({
        organizationId: user.organizationId,
        userId: user.userId,
        interviewId,
      });
      if (!panelOk) {
        return NextResponse.json({ detail: "Access denied" }, { status: 403 });
      }
      const iv = await selectInterviewById(interviewId, user.organizationId);
      if (!iv) {
        return NextResponse.json({ detail: "Interview not found" }, { status: 404 });
      }
      const cand = await selectCandidateById(iv.candidateId, user.organizationId);
      const resumePath = cand?.resumePath?.trim() ?? "";
      if (!resumePath) {
        return NextResponse.json({ detail: "No resume on file for this candidate" }, { status: 404 });
      }
      const storedKey = path.basename(resumePath);
      const requestedKey = path.basename(params.filename.trim());
      if (storedKey !== requestedKey) {
        return NextResponse.json(
          { detail: "Resume file does not match this interview's candidate" },
          { status: 403 },
        );
      }
      resumeAccessOk = true;
    }

    if (!resumeAccessOk) {
      return NextResponse.json({ detail: "Access denied" }, { status: 403 });
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
