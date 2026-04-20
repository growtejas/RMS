import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

/** Stored in `candidates.resume_parse_cache` JSON. */
export const RESUME_PARSE_CACHE_VERSION = 1;
/** Match `MAX_RAW_TEXT_CHARS` in resume-parser-service. */
export const RESUME_PARSE_CACHE_MAX_RAW_CHARS = 12000;

export type ResumeParseLocalStat = { size: number; mtimeMs: number };

export type ResumeParseCacheRecord = {
  v: number;
  parserProvider: string;
  parserVersion: string;
  status: ParsedResumeArtifact["status"];
  sourceResumeRef: string | null;
  rawText: string | null;
  parsedData: Record<string, unknown>;
  errorMessage: string | null;
  /** `candidates.resume_path` value when cached; must match to reuse cache. */
  storedResumePath: string | null;
  /** Present for local files: invalidates cache when file replaced at same path. */
  localStat?: ResumeParseLocalStat;
};

export function normalizeTextForResumeHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function hashNormalizedResumeText(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Hash of normalized resume plain text (same basis as parser excerpt). */
export function hashResumePlainText(plainText: string): string {
  return hashNormalizedResumeText(normalizeTextForResumeHash(plainText));
}

function isHttpResumeRef(resumeRef: string): boolean {
  return /^https?:\/\//i.test(resumeRef.trim());
}

/** Same path rules as ranking / uploads: URL, absolute path, or key under uploads/resumes. */
export function resolveResumeRefForFilesystem(resumePathValue: string | null | undefined): string | null {
  if (!resumePathValue || !resumePathValue.trim()) {
    return null;
  }
  const v = resumePathValue.trim();
  if (/^https?:\/\//i.test(v)) {
    return v;
  }
  if (path.isAbsolute(v)) {
    return v;
  }
  if (v.includes("/") || v.includes("\\")) {
    return path.join(process.cwd(), v);
  }
  return path.join(process.cwd(), "uploads", "resumes", v);
}

export async function tryStatLocalResumeFile(resumeRef: string): Promise<ResumeParseLocalStat | null> {
  if (isHttpResumeRef(resumeRef)) {
    return null;
  }
  try {
    const st = await fs.stat(resumeRef);
    if (!st.isFile()) return null;
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

export async function cacheStillValidForResumeRef(
  record: ResumeParseCacheRecord,
  resumeRef: string,
): Promise<boolean> {
  if (isHttpResumeRef(resumeRef)) {
    return true;
  }
  if (!record.localStat) {
    return false;
  }
  const now = await tryStatLocalResumeFile(resumeRef);
  if (!now) {
    return false;
  }
  return now.size === record.localStat.size && now.mtimeMs === record.localStat.mtimeMs;
}

export function parsedArtifactToCacheRecord(
  artifact: ParsedResumeArtifact,
  localStat: ResumeParseLocalStat | null,
  storedResumePath: string | null,
): ResumeParseCacheRecord {
  const raw = artifact.rawText ?? "";
  const capped =
    raw.length > RESUME_PARSE_CACHE_MAX_RAW_CHARS
      ? raw.slice(0, RESUME_PARSE_CACHE_MAX_RAW_CHARS)
      : raw;
  const rec: ResumeParseCacheRecord = {
    v: RESUME_PARSE_CACHE_VERSION,
    parserProvider: artifact.parserProvider,
    parserVersion: artifact.parserVersion,
    status: artifact.status,
    sourceResumeRef: artifact.sourceResumeRef,
    rawText: capped || null,
    parsedData:
      typeof artifact.parsedData === "object" && artifact.parsedData !== null
        ? (artifact.parsedData as Record<string, unknown>)
        : {},
    errorMessage: artifact.errorMessage,
    storedResumePath: storedResumePath?.trim() || null,
  };
  if (localStat) {
    rec.localStat = localStat;
  }
  return rec;
}

export function cacheRecordToParsedArtifact(record: unknown): ParsedResumeArtifact | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const o = record as Record<string, unknown>;
  if (o.v !== RESUME_PARSE_CACHE_VERSION) {
    return null;
  }
  const status = o.status;
  if (status !== "processed" && status !== "failed" && status !== "skipped") {
    return null;
  }
  const parsedData = o.parsedData;
  if (typeof parsedData !== "object" || parsedData === null) {
    return null;
  }
  if (!("storedResumePath" in o)) {
    return null;
  }
  return {
    parserProvider: typeof o.parserProvider === "string" ? o.parserProvider : "fallback-local",
    parserVersion: typeof o.parserVersion === "string" ? o.parserVersion : "v1",
    status,
    sourceResumeRef: typeof o.sourceResumeRef === "string" ? o.sourceResumeRef : null,
    rawText: typeof o.rawText === "string" ? o.rawText : null,
    parsedData: parsedData as Record<string, unknown>,
    errorMessage: typeof o.errorMessage === "string" ? o.errorMessage : null,
  };
}

/** Content hash from processed raw text; null if no text to hash. */
export function contentHashFromArtifact(artifact: ParsedResumeArtifact): string | null {
  if (artifact.status !== "processed" || !artifact.rawText?.trim()) {
    return null;
  }
  return hashResumePlainText(artifact.rawText);
}

/** Return cached artifact when path + file stat still match; otherwise null. */
export async function tryResumeParseCacheHit(params: {
  candidateResumePath: string | null;
  resumeRef: string;
  dbCache: unknown;
}): Promise<ParsedResumeArtifact | null> {
  if (!params.dbCache || typeof params.dbCache !== "object") {
    return null;
  }
  const full = params.dbCache as ResumeParseCacheRecord;
  const record = cacheRecordToParsedArtifact(params.dbCache);
  if (!record) {
    return null;
  }
  if ((full.storedResumePath ?? "") !== (params.candidateResumePath?.trim() ?? "")) {
    return null;
  }
  if (!(await cacheStillValidForResumeRef(full, params.resumeRef))) {
    return null;
  }
  return record;
}
