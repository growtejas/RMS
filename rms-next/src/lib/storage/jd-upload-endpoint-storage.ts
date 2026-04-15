import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import { resolveUnderBaseDir } from "@/lib/storage/local-upload-path";

/**
 * Directory for `POST /api/uploads/jd` (FastAPI `get_jd_storage_service`: env * `JD_UPLOAD_DIR`, default `uploads/jd`). Separate from requisition JD
 * (`STORAGE_LOCAL_DIR` / `storage/jd`).
 */
export function getJdUploadEndpointBaseDir(): string {
  return path.resolve(
    process.cwd(),
    process.env.JD_UPLOAD_DIR ?? path.join("uploads", "jd"),
  );
}

export async function ensureJdUploadEndpointDir(): Promise<void> {
  await fs.mkdir(getJdUploadEndpointBaseDir(), { recursive: true });
}

export async function jdUploadEndpointSave(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  await ensureJdUploadEndpointDir();
  const safe = path.basename(filename);
  const target = resolveUnderBaseDir(getJdUploadEndpointBaseDir(), safe);
  await fs.writeFile(target, buffer);
  return safe;
}

export async function jdUploadEndpointSaveStream(
  stream: Readable,
  filename: string,
): Promise<string> {
  await ensureJdUploadEndpointDir();
  const safe = path.basename(filename);
  const target = resolveUnderBaseDir(getJdUploadEndpointBaseDir(), safe);
  await pipeline(stream, createWriteStream(target));
  return safe;
}

/** Absolute filesystem path for a stored basename (matches FastAPI `get_url` for local). */
export function jdUploadEndpointAbsolutePath(key: string): string {
  return resolveUnderBaseDir(getJdUploadEndpointBaseDir(), key);
}
