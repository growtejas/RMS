import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedInboundCandidate, ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

const PARSER_PROVIDER = "fallback-local";
const PARSER_VERSION = "v2";
const MAX_RAW_TEXT_CHARS = 12000;
/** Below this length we try other extractors (mislabeled files, weak PDF text layers). */
const MIN_MEANINGFUL_EXTRACT_CHARS = 40;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Extension from a local path or file URL; strips query/hash so `.pdf?x=1` → `.pdf`. */
export function normalizedResumeExtension(resumeRef: string): string {
  const trimmed = resumeRef.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return path.extname(u.pathname).toLowerCase();
    } catch {
      return "";
    }
  }
  const noQuery = trimmed.replace(/[?#].*$/, "");
  return path.extname(noQuery).toLowerCase();
}

function sniffBufferKind(buffer: Buffer): "pdf" | "zip" | "ole" | "unknown" {
  if (buffer.length < 8) return "unknown";
  const sig4 = buffer.subarray(0, 4).toString("latin1");
  if (sig4.startsWith("%PDF")) return "pdf";
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf) return "ole";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "zip";
  }
  return "unknown";
}

function needleMatchesResume(paddedLower: string, needle: string): boolean {
  const n = needle.toLowerCase();
  if (n.includes(" ")) {
    return paddedLower.includes(n);
  }
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(paddedLower);
}

function extractSkills(text: string): string[] {
  const known: { needle: string; canonical: string }[] = [
    { needle: "javascript", canonical: "javascript" },
    { needle: "typescript", canonical: "typescript" },
    { needle: "react native", canonical: "react native" },
    { needle: "react.js", canonical: "react" },
    { needle: "reactjs", canonical: "react" },
    { needle: "react", canonical: "react" },
    { needle: "next.js", canonical: "next.js" },
    { needle: "nextjs", canonical: "next.js" },
    { needle: "node.js", canonical: "node" },
    { needle: "nodejs", canonical: "node" },
    { needle: "node", canonical: "node" },
    { needle: "express", canonical: "express" },
    { needle: "vue", canonical: "vue" },
    { needle: "angular", canonical: "angular" },
    { needle: "svelte", canonical: "svelte" },
    { needle: "python", canonical: "python" },
    { needle: "django", canonical: "django" },
    { needle: "flask", canonical: "flask" },
    { needle: "fastapi", canonical: "fastapi" },
    { needle: "java", canonical: "java" },
    { needle: "spring", canonical: "spring" },
    { needle: "kotlin", canonical: "kotlin" },
    { needle: "golang", canonical: "go" },
    { needle: "rust", canonical: "rust" },
    { needle: "c#", canonical: "c#" },
    { needle: "sql", canonical: "sql" },
    { needle: "postgresql", canonical: "postgresql" },
    { needle: "postgres", canonical: "postgresql" },
    { needle: "mysql", canonical: "mysql" },
    { needle: "mongodb", canonical: "mongodb" },
    { needle: "redis", canonical: "redis" },
    { needle: "aws", canonical: "aws" },
    { needle: "azure", canonical: "azure" },
    { needle: "gcp", canonical: "gcp" },
    { needle: "docker", canonical: "docker" },
    { needle: "kubernetes", canonical: "kubernetes" },
    { needle: "kafka", canonical: "kafka" },
    { needle: "graphql", canonical: "graphql" },
    { needle: "html", canonical: "html" },
    { needle: "css", canonical: "css" },
    { needle: "tailwind", canonical: "tailwind" },
    { needle: "sass", canonical: "sass" },
  ];

  const spaced = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { needle, canonical } of known) {
    if (!needleMatchesResume(spaced, needle)) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
    if (out.length >= 20) break;
  }
  return out;
}

function extractExperienceYears(text: string): number | null {
  const lower = text.toLowerCase();
  const patterns: RegExp[] = [
    /(\d{1,2}(?:\.\d)?)\s*\+\s*(?:years|yrs)\b/g,
    /(\d{1,2}(?:\.\d)?)\s*(?:years|yrs)(?:\s+of)?\s+(?:experience|exp)\b/g,
    /(?:experience|exp)(?:\s*[:,-])?\s*(\d{1,2}(?:\.\d)?)\s*(?:years|yrs)\b/g,
    /(?:over|more than|above|approximately|around)\s+(\d{1,2}(?:\.\d)?)\s*(?:years|yrs)\b/g,
    /(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)\b/g,
  ];
  const nums: number[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const raw = m[1] ?? m[0];
      const n = Number.parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n >= 0 && n <= 80) nums.push(n);
    }
  }
  if (nums.length === 0) return null;
  return clamp(Math.max(...nums), 0, 80);
}

function extractNoticePeriodDays(text: string): number | null {
  const lower = text.toLowerCase();
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

function extractProjects(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const out: string[] = [];
  const seen = new Set<string>();
  let inProjects = false;
  const projectHeader = /^(projects|personal projects|key projects)\b/i;
  const sectionHeader =
    /^(skills|technical skills|experience|work experience|employment|education|certifications|courses|profile summary|summary)\b/i;

  for (const line of lines) {
    if (!line) continue;
    if (projectHeader.test(line)) {
      inProjects = true;
      continue;
    }
    if (!inProjects) continue;
    if (sectionHeader.test(line)) break;
    const cleaned = line
      .replace(/^[-•*▪·]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (!cleaned || cleaned.length > 220) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= 40) break;
  }

  return out;
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase()))).slice(0, 5);
}

function extractPhones(text: string): string[] {
  const matches = text.match(/(?:\+?\d[\d\s-]{7,}\d)/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, " ").trim()))).slice(0, 5);
}

function meaningfulExtract(text: string): boolean {
  return text.trim().length >= MIN_MEANINGFUL_EXTRACT_CHARS;
}

function toParsedData(text: string, fallback: NormalizedInboundCandidate): Record<string, unknown> {
  const excerpt = text.slice(0, MAX_RAW_TEXT_CHARS);
  return {
    full_name: fallback.fullName,
    emails: extractEmails(excerpt),
    phones: extractPhones(excerpt),
    skills: extractSkills(excerpt),
    projects: extractProjects(excerpt),
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

async function parseWordOleOrOpenXml(buffer: Buffer): Promise<string> {
  const mod = await import("word-extractor");
  const WordExtractor = mod.default;
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return doc.getBody().trim();
}

/**
 * Best-effort plain text from resume bytes. Uses magic-byte sniffing, not only the filename.
 */
export async function extractResumePlainText(
  buffer: Buffer,
  extensionHint: string,
): Promise<{ text: string; extractor_chain: string[] }> {
  const ext = extensionHint.toLowerCase();
  const kind = sniffBufferKind(buffer);
  const chain: string[] = [];
  const tried = new Set<string>();

  const run = async (label: string, fn: () => Promise<string>): Promise<string> => {
    if (tried.has(label)) return "";
    tried.add(label);
    chain.push(label);
    try {
      return (await fn()).trim();
    } catch {
      return "";
    }
  };

  let order: ("pdf" | "docx" | "word")[];
  if (kind === "pdf" || ext === ".pdf") {
    order = ["pdf", "docx", "word"];
  } else if (kind === "zip" || ext === ".docx") {
    order = ["docx", "word", "pdf"];
  } else if (kind === "ole" || ext === ".doc") {
    order = ["word", "docx", "pdf"];
  } else {
    order = ["pdf", "docx", "word"];
  }

  let best = "";
  for (const step of order) {
    let t = "";
    if (step === "pdf") {
      t = await run("pdf-parse", () => parsePdf(buffer));
    } else if (step === "docx") {
      t = await run("mammoth-docx", () => parseDocx(buffer));
    } else {
      t = await run("word-extractor", () => parseWordOleOrOpenXml(buffer));
    }
    if (t.length > best.length) best = t;
    if (meaningfulExtract(t)) {
      return { text: t, extractor_chain: chain };
    }
  }

  return { text: best.trim(), extractor_chain: chain };
}

/**
 * Extract plain text from a PDF, DOC, or DOCX buffer (JD uploads, etc.).
 * Unknown extensions try PDF first, then DOCX / word-extractor.
 */
export async function extractOfficeDocumentText(
  buffer: Buffer,
  filenameHint: string,
): Promise<string> {
  const ext = normalizedResumeExtension(filenameHint || "file.bin");
  const { text } = await extractResumePlainText(buffer, ext || ".pdf");
  return text;
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
    const ext = normalizedResumeExtension(resumeRef);
    const { text: fullText, extractor_chain } = await extractResumePlainText(buffer, ext);

    if (!fullText.trim()) {
      return {
        parserProvider: PARSER_PROVIDER,
        parserVersion: PARSER_VERSION,
        status: "failed",
        sourceResumeRef: resumeRef,
        rawText: null,
        parsedData: {
          reason: "No text could be extracted from resume (empty PDF layer, unsupported format, or corrupt file)",
          resume_extension: ext || null,
          buffer_kind: sniffBufferKind(buffer),
          extractor_chain,
        },
        errorMessage: "Resume text extraction returned empty body",
      };
    }

    const limitedText = fullText.slice(0, MAX_RAW_TEXT_CHARS);
    const parsedData = toParsedData(limitedText, params.normalizedCandidate);
    return {
      parserProvider: PARSER_PROVIDER,
      parserVersion: PARSER_VERSION,
      status: "processed",
      sourceResumeRef: resumeRef,
      rawText: limitedText,
      parsedData: {
        ...parsedData,
        resume_extension: ext || null,
        buffer_kind: sniffBufferKind(buffer),
        extractor_chain,
      },
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
