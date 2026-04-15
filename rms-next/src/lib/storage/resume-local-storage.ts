import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import { resolveUnderBaseDir } from "@/lib/storage/local-upload-path";

/** FastAPI `get_resume_storage_service`: `RESUME_UPLOAD_DIR`, default `uploads/resumes`. */
export function getResumeStorageBaseDir(): string {
  return path.resolve(
    process.cwd(),
    process.env.RESUME_UPLOAD_DIR ?? path.join("uploads", "resumes"),
  );
}

export async function ensureResumeStorageDir(): Promise<void> {
  await fs.mkdir(getResumeStorageBaseDir(), { recursive: true });
}

export async function resumeSaveBuffer(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  await ensureResumeStorageDir();
  const safe = path.basename(filename);
  const target = resolveUnderBaseDir(getResumeStorageBaseDir(), safe);
  await fs.writeFile(target, buffer);
  return safe;
}

export async function resumeSaveStream(
  stream: Readable,
  filename: string,
): Promise<string> {
  await ensureResumeStorageDir();
  const safe = path.basename(filename);
  const target = resolveUnderBaseDir(getResumeStorageBaseDir(), safe);
  await pipeline(stream, createWriteStream(target));
  return safe;
}

export function resumeLocalFilePath(key: string): string {
  return resolveUnderBaseDir(getResumeStorageBaseDir(), key);
}

export function resumeMediaType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") {
    return "application/pdf";
  }
  if (ext === ".doc") {
    return "application/msword";
  }
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}
