import fs from "node:fs/promises";
import path from "node:path";

import type { NormalizedInboundCandidate, ParsedResumeArtifact } from "@/lib/queue/inbound-events-queue";

const PARSER_PROVIDER = "fallback-local";
const PARSER_VERSION = "v1";
const MAX_RAW_TEXT_CHARS = 12000;

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
  let parser: ((input: Buffer) => Promise<{ text?: string }>) | null = null;

  // Prefer direct lib import to avoid legacy entrypoint debug side effects.
  try {
    const lib = (await import("pdf-parse/lib/pdf-parse.js")) as unknown;
    if (typeof lib === "function") {
      parser = lib as (input: Buffer) => Promise<{ text?: string }>;
    } else if (typeof (lib as { default?: unknown }).default === "function") {
      parser = (lib as { default: (input: Buffer) => Promise<{ text?: string }> }).default;
    }
  } catch {
    // Fallback below.
  }

  if (!parser) {
    const mod = (await import("pdf-parse")) as unknown;
    const candidate =
      (mod as { default?: unknown }).default ??
      (mod as { pdf?: unknown }).pdf ??
      mod;
    if (typeof candidate !== "function") {
      throw new Error("Unable to resolve pdf parser function from pdf-parse package");
    }
    parser = candidate as (input: Buffer) => Promise<{ text?: string }>;
  }

  const out = await parser(buffer);
  return out.text?.trim() ?? "";
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const out = await mammoth.extractRawText({ buffer });
  return out.value.trim();
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
