import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { referenceWriteCatch } from "@/lib/api/reference-write-errors";
import { requireAnyRole, requireBearerUser } from "@/lib/auth/api-guard";
import {
  jdUploadEndpointAbsolutePath,
  jdUploadEndpointSaveStream,
} from "@/lib/storage/jd-upload-endpoint-storage";
import { webToNodeReadable } from "@/lib/node/streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["application/pdf", "text/plain"]);
const MAX = 10 * 1024 * 1024;

/** POST /api/uploads/jd — parity with FastAPI `POST /api/uploads/jd`. */
export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req);
    if (user instanceof NextResponse) {
      return user;
    }
    const denied = requireAnyRole(user, "HR", "Admin", "Manager", "Employee");
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
      return NextResponse.json({ detail: "Invalid file type" }, { status: 400 });
    }
    if (file.size > MAX) {
      return NextResponse.json({ detail: "File exceeds 10MB" }, { status: 400 });
    }

    const ext = mime === "application/pdf" ? ".pdf" : ".txt";
    const filename = `${randomBytes(16).toString("hex")}${ext}`;
    const key = await jdUploadEndpointSaveStream(webToNodeReadable(file.stream()), filename);
    const file_url = jdUploadEndpointAbsolutePath(key);

    return NextResponse.json({ file_url });
  } catch (e) {
    return referenceWriteCatch(e, "[POST /api/uploads/jd]");
  }
}
