import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import { extractPrimarySkillsFromJdPdf } from "@/lib/services/jd-skill-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** POST /api/skills/extract-from-jd — parse JD PDF and return relevant skills. */
export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "Manager", "HR", "Admin", "Owner");
    if (denied) {
      return denied;
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { detail: "Expected multipart form data" },
        { status: 400 },
      );
    }

    const jdFile = form.get("jd_file");
    if (!(jdFile instanceof File) || jdFile.size === 0) {
      return NextResponse.json(
        { detail: "jd_file is required" },
        { status: 400 },
      );
    }
    const mime = (jdFile.type || "").trim().toLowerCase();
    if (mime !== "application/pdf") {
      return NextResponse.json(
        { detail: "Only PDF JD files are supported" },
        { status: 400 },
      );
    }
    if (jdFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { detail: "File exceeds 10MB limit" },
        { status: 400 },
      );
    }

    const extractedSkills = await extractPrimarySkillsFromJdPdf(jdFile);
    return NextResponse.json({ extractedSkills });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/skills/extract-from-jd]");
  }
}
