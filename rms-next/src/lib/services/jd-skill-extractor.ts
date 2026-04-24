import { getSkillsCatalog } from "@/lib/services/reference-read-service";

const MAX_EXTRACTED_SKILLS = 20;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSkill(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

async function parsePdfText(buffer: Buffer): Promise<string> {
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
  return (out.text ?? "").trim();
}

function scoreSkillInText(skillName: string, lowerText: string): number {
  const normalized = normalizeSkill(skillName).toLowerCase();
  if (!normalized) return 0;

  const escaped = escapeRegex(normalized);
  const pattern =
    normalized.includes(" ") || /[+#./-]/.test(normalized)
      ? new RegExp(escaped, "gi")
      : new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "gi");
  const matches = lowerText.match(pattern);
  return matches?.length ?? 0;
}

export async function extractPrimarySkillsFromJdPdf(
  file: File,
): Promise<string[]> {
  const arr = await file.arrayBuffer();
  const text = await parsePdfText(Buffer.from(arr));
  if (!text) return [];

  const lowerText = text.toLowerCase().replace(/\s+/g, " ");
  const catalog = await getSkillsCatalog();

  const scored = catalog
    .map((row) => ({
      name: normalizeSkill(row.skill_name),
      score: scoreSkillInText(row.skill_name, lowerText),
    }))
    .filter((row) => row.name.length > 0 && row.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of scored) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row.name);
    if (out.length >= MAX_EXTRACTED_SKILLS) break;
  }
  return out;
}
