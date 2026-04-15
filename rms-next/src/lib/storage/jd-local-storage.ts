import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export function getJdStorageBaseDir(): string {
  return (
    process.env.STORAGE_LOCAL_DIR ??
    path.join(process.cwd(), "storage", "jd")
  );
}

export async function ensureJdStorageDir(): Promise<void> {
  await fs.mkdir(getJdStorageBaseDir(), { recursive: true });
}

export function jdSafeBasename(filename: string): string {
  return path.basename(filename);
}

function resolvedPathInBase(safeName: string): string {
  const base = path.resolve(getJdStorageBaseDir());
  const target = path.resolve(path.join(base, safeName));
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("Invalid filename");
  }
  return target;
}

export async function jdSaveBuffer(filename: string, data: Buffer): Promise<string> {
  await ensureJdStorageDir();
  const safe = jdSafeBasename(filename);
  const target = resolvedPathInBase(safe);
  await fs.writeFile(target, data);
  return safe;
}

export async function jdSaveStream(
  filename: string,
  stream: Readable,
): Promise<string> {
  await ensureJdStorageDir();
  const safe = jdSafeBasename(filename);
  const target = resolvedPathInBase(safe);
  await pipeline(stream, createWriteStream(target));
  return safe;
}

export async function jdDeleteFile(key: string): Promise<void> {
  const safe = jdSafeBasename(key);
  const target = resolvedPathInBase(safe);
  try {
    await fs.unlink(target);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw e;
    }
  }
}

export function jdLocalFilePath(key: string): string {
  const safe = jdSafeBasename(key);
  return resolvedPathInBase(safe);
}

export function jdIsRemoteUrl(key: string): boolean {
  return key.startsWith("http://") || key.startsWith("https://");
}
