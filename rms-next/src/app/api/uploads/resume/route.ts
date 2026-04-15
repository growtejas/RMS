import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  resumeLocalFilePath,
  resumeSaveStream,
} from "@/lib/storage/resume-local-storage";
import { webToNodeReadable } from "@/lib/node/streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
};

const MAX = 10 * 1024 * 1024;

/** POST /api/uploads/resume — parity with FastAPI `POST /api/uploads/resume`. */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "TA", "HR", "Admin");
    if (denied) {
      return denied;
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { detail: "Expected multipart form data" },
        { status: 400 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ detail: "file is required" }, { status: 400 });
    }

    const mime = (file.type || "").trim() || "application/octet-stream";
    if (!ALLOWED.has(mime)) {
      return NextResponse.json(
        { detail: "Invalid file type. Allowed: PDF, DOC, DOCX" },
        { status: 400 },
      );
    }
    if (file.size > MAX) {
      return NextResponse.json({ detail: "File exceeds 10MB" }, { status: 400 });
    }

    const ext = EXT[mime] ?? ".pdf";
    const filename = `${randomBytes(16).toString("hex")}${ext}`;
    const key = await resumeSaveStream(webToNodeReadable(file.stream()), filename);
    const file_url = resumeLocalFilePath(key);

    return NextResponse.json({ file_url, filename: key });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/uploads/resume]");
  }
}
