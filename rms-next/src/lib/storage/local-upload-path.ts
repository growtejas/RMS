import path from "node:path";

/** Resolve a basename-only key under baseDir; rejects path traversal. */
export function resolveUnderBaseDir(baseDir: string, filename: string): string {
  const base = path.resolve(baseDir);
  const safe = path.basename(filename);
  const target = path.resolve(path.join(base, safe));
  if (!target.startsWith(base + path.sep) && target !== base) {
    throw new Error("Invalid filename");
  }
  return target;
}
