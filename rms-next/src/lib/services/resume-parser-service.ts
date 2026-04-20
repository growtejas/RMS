import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedInboundCandidate, ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

const PARSER_PROVIDER = "fallback-local";
const PARSER_VERSION = "v1";
const MAX_RAW_TEXT_CHARS = 12000;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function extractSkills(text: string): string[] {
  const known = [
    "javascript",
    "typescript",
    "react",
    "node",
    "next.js",
    "python",
    "java",
    "sql",
    "postgresql",
    "aws",
    "docker",
    "redis",
  ];
  const lower = text.toLowerCase();
  return known.filter((skill) => lower.includes(skill)).slice(0, 15);
}

function extractExperienceYears(text: string): number | null {
  const lower = text.toLowerCase();
  // Common patterns: "X years", "X+ years", "X.Y years", "experience: X years"
  const matches =
    lower.match(/(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)\b/g) ?? [];
  const nums = matches
    .map((m) => Number.parseFloat(m.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 80);
  if (nums.length === 0) return null;
  // Take max as a conservative estimate for total experience.
  return clamp(Math.max(...nums), 0, 80);
}

function extractNoticePeriodDays(text: string): number | null {
  const lower = text.toLowerCase();
  // Look for explicit notice period mentions first.
  const noticeLine =
    lower.match(/notice\s*period[^0-9]{0,20}(\d{1,3})\s*(days|day|weeks|week|months|month)\b/) ??
    lower.match(/(\d{1,3})\s*(days|day|weeks|week|months|month)\s*notice\b/);
  if (!noticeLine) return null;
  const n = Number.parseInt(noticeLine[1] ?? "", 10);
  const unit = (noticeLine[2] ?? "").toLowerCase();
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit.startsWith("day")) return clamp(n, 0, 365);
  if (unit.startsWith("week")) return clamp(n * 7, 0, 365);
  if (unit.startsWith("month")) return clamp(n * 30, 0, 365);
  return null;
}

function extractEducationRaw(text: string): string | null {
  const lower = text.toLowerCase();
  const patterns = [
    /\b(b\.?tech|btech|be|b\.?e)\b[^\n]{0,80}/i,
    /\b(m\.?tech|mtech|me|m\.?e)\b[^\n]{0,80}/i,
    /\b(mca|bca)\b[^\n]{0,80}/i,
    /\b(bachelor(?:'s)?|master(?:'s)?)\b[^\n]{0,80}/i,
    /\b(b\.?sc|m\.?sc|bsc|msc)\b[^\n]{0,80}/i,
    /\b(mba)\b[^\n]{0,80}/i,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m && m[0]) {
      return m[0].trim().slice(0, 120);
    }
  }
  return null;
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase()))).slice(0, 5);
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, " ").trim()))).slice(0, 5);
}

function toParsedData(text: string, fallback: NormalizedInboundCandidate): Record<string, unknown> {
  const excerpt = text.slice(0, MAX_RAW_TEXT_CHARS);
  return {
    full_name: fallback.fullName,
    emails: extractEmails(excerpt),
    phones: extractPhones(excerpt),
    skills: extractSkills(excerpt),
    experience_years: extractExperienceYears(excerpt),
    notice_period_days: extractNoticePeriodDays(excerpt),
    education_raw: extractEducationRaw(excerpt),
    text_length: excerpt.length,
  };
}

async function readResumeBuffer(resumeRef: string): Promise<Buffer> {
  const isHttp = /^https?:\/\//i.test(resumeRef);
  if (isHttp) {
    const res = await fetch(resumeRef);
    if (!res.ok) {
      throw new Error(`Resume fetch failed with status ${res.status}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  return fs.readFile(resumeRef);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const mod = (await import("pdf-parse")) as unknown;
  const candidate =
    (mod as { default?: unknown }).default ??
    (mod as { pdf?: unknown }).pdf ??
    mod;
  if (typeof candidate !== "function") {
    throw new Error("Unable to resolve pdf parser function from pdf-parse package");
  }
  const parser = candidate as (input: Buffer) => Promise<{ text?: string }>;
  const out = await parser(buffer);
  return out.text?.trim() ?? "";
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const out = await mammoth.extractRawText({ buffer });
  return out.value.trim();
}

/**
 * Extract plain text from a PDF or DOCX buffer (JD uploads, etc.).
 * Unknown extensions try PDF first (JD pipeline is PDF-first), then DOCX.
 */
export async function extractOfficeDocumentText(
  buffer: Buffer,
  filenameHint: string,
): Promise<string> {
  const ext = path.extname(filenameHint).toLowerCase();
  if (ext === ".docx") {
    return (await parseDocx(buffer)).trim();
  }
  if (ext === ".pdf") {
    return (await parsePdf(buffer)).trim();
  }
  const asPdf = (await parsePdf(buffer)).trim();
  if (asPdf.length > 0) {
    return asPdf;
  }
  try {
    const asDocx = (await parseDocx(buffer)).trim();
    if (asDocx.length > 0) {
      return asDocx;
    }
  } catch {
    // not a docx
  }
  if (ext) {
    throw new Error(`Unsupported document extension '${ext}'`);
  }
  return "";
}

export async function parseResumeArtifact(params: {
  normalizedCandidate: NormalizedInboundCandidate;
}): Promise<ParsedResumeArtifact> {
  const resumeRef = params.normalizedCandidate.resumeUrl;
  if (!resumeRef) {
    return {
      parserProvider: PARSER_PROVIDER,
      parserVersion: PARSER_VERSION,
      status: "skipped",
      sourceResumeRef: null,
      rawText: null,
      parsedData: {
        reason: "No resume reference found in normalized payload",
      },
      errorMessage: null,
    };
  }

  try {
    const buffer = await readResumeBuffer(resumeRef);
    const ext = path.extname(resumeRef).toLowerCase();
    let text = "";

    if (ext === ".pdf") {
      text = await parsePdf(buffer);
    } else if (ext === ".docx") {
      text = await parseDocx(buffer);
    } else {
      throw new Error(`Unsupported resume extension '${ext || "unknown"}'`);
    }

    const limitedText = text.slice(0, MAX_RAW_TEXT_CHARS);
    return {
      parserProvider: PARSER_PROVIDER,
      parserVersion: PARSER_VERSION,
      status: "processed",
      sourceResumeRef: resumeRef,
      rawText: limitedText,
      parsedData: toParsedData(limitedText, params.normalizedCandidate),
      errorMessage: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown resume parse failure";
    return {
      parserProvider: PARSER_PROVIDER,
      parserVersion: PARSER_VERSION,
      status: "failed",
      sourceResumeRef: resumeRef,
      rawText: null,
      parsedData: {
        reason: "Resume parsing failed",
      },
      errorMessage: message,
    };
  }
}
