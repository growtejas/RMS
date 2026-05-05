import { log } from "@/lib/logging/logger";
import { createHash } from "node:crypto";
import {
  resolveAiEvalEnabled,
  resolveAiEvalGeminiModel,
  resolveAiEvalLlmProvider,
  resolveAiEvalMaxUserChars,
  resolveAiEvalTimeoutMs,
  normalizeGeminiModelId,
  type AiEvalLlmProvider,
} from "@/lib/services/ai-evaluation/ai-evaluation-llm";
import {
  candidateReportZ,
  type CandidateReport,
  type ParsedCandidate,
} from "@/lib/services/cie/cie.schema";
import type { LegacyParsedDataHints } from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";
import { resolveResumeStructureV2Enabled } from "@/lib/services/resume-structure/strict-resume-v2-llm";
import { z } from "zod";

export function resolveCiePromptVersion(): string {
  return process.env.CIE_PROMPT_VERSION?.trim() || "cie-report-v1";
}

/** Corpus for CIE parsed snapshot: legacy fallback-local v2 vs structured resume profile. */
export type CieParserSource = "legacy" | "structured";

export function resolveCieParserSource(): CieParserSource {
  const v = process.env.CIE_PARSER_SOURCE?.trim().toLowerCase();
  if (v === "structured") return "structured";
  return "legacy";
}

/**
 * Dedupe key for `candidate_parsed_data.source_resume_content_hash` so switching
 * `CIE_PARSER_SOURCE` invalidates prior parsed rows without a DB migration.
 *
 * DB column is varchar(64), so we store a fixed 64-char SHA256 digest.
 */
export function resolveCieParsedSnapshotDedupeKey(resumeContentHash: string | null): string {
  const raw = `${resumeContentHash ?? "none"}:${resolveCieParserSource()}:v2_${resolveResumeStructureV2Enabled() ? "on" : "off"}`;
  return createHash("sha256").update(raw).digest("hex");
}

/** Which backend CIE uses (independent of AI ranking eval when `CIE_LLM_PROVIDER` is set). */
export function resolveCieLlmProvider(): AiEvalLlmProvider {
  const explicit = process.env.CIE_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "groq") return "groq";
  if (explicit === "gemini") return "gemini";
  const cieGroqKey = Boolean(process.env.CIE_GROQ_API_KEY?.trim());
  const cieGemKey = Boolean(process.env.CIE_GEMINI_API_KEY?.trim());
  if (cieGroqKey && !cieGemKey) {
    return "groq";
  }
  if (cieGemKey && !cieGroqKey) {
    return "gemini";
  }
  return resolveAiEvalLlmProvider();
}

function resolveCieGeminiApiKey(): string | undefined {
  return process.env.CIE_GEMINI_API_KEY?.trim() || process.env.AI_EVAL_GEMINI_API_KEY?.trim();
}

function resolveCieGroqApiKey(): string | undefined {
  return process.env.CIE_GROQ_API_KEY?.trim() || process.env.AI_EVAL_GROQ_API_KEY?.trim();
}

const GROQ_OPENAI_COMPAT_BASE = "https://api.groq.com/openai/v1";

function resolveCieGroqBaseUrl(): string {
  let raw = (
    process.env.CIE_GROQ_BASE_URL?.trim() ||
    process.env.AI_EVAL_GROQ_BASE_URL?.trim() ||
    GROQ_OPENAI_COMPAT_BASE
  ).replace(/\/$/, "");
  const key = resolveCieGroqApiKey() ?? "";
  // Groq keys are `gsk_…`; OpenAI expects `sk-…`. Same env shape, wrong host → opaque "invalid_api_key" from OpenAI.
  if (key.startsWith("gsk_") && /openai\.com/i.test(raw)) {
    log("warn", "cie_groq_key_openai_host", {
      message:
        "Groq keys (gsk_) were used with an OpenAI API URL. Using Groq OpenAI-compatible base instead.",
      ignored_base_url: raw,
    });
    raw = GROQ_OPENAI_COMPAT_BASE;
  }
  return raw;
}

function resolveCieGroqModel(): string {
  return (
    process.env.CIE_GROQ_MODEL?.trim() ||
    process.env.AI_EVAL_GROQ_MODEL?.trim() ||
    "llama-3.1-8b-instant"
  );
}

function resolveCieGeminiModel(): string {
  const fromCie = process.env.CIE_GEMINI_MODEL?.trim();
  if (fromCie) return normalizeGeminiModelId(fromCie);
  return resolveAiEvalGeminiModel();
}

function resolveCieGeminiBaseUrl(): string {
  return (
    process.env.CIE_GEMINI_BASE_URL?.trim() ||
    process.env.AI_EVAL_GEMINI_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");
}

function resolveCieTimeoutMs(): number {
  const n = Number(process.env.CIE_TIMEOUT_MS ?? "");
  if (Number.isFinite(n) && n >= 5000) {
    return Math.min(n, 120_000);
  }
  return resolveAiEvalTimeoutMs();
}

function resolveCieMaxUserChars(): number {
  const n = Number(process.env.CIE_MAX_INPUT_CHARS ?? "");
  if (Number.isFinite(n) && n >= 2000) {
    return Math.min(n, 80_000);
  }
  return resolveAiEvalMaxUserChars();
}

/**
 * OpenAI-style `response_format: { type: "json_object" }` — disable for some compatible gateways
 * (e.g. older local models) via `CIE_OPENAI_JSON_RESPONSE_MODE=false`.
 */
function resolveCieOpenAiJsonResponseMode(): boolean {
  const v = process.env.CIE_OPENAI_JSON_RESPONSE_MODE?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") {
    return false;
  }
  return true;
}

/** True when the resolved CIE provider has an API key (CIE_* or AI_EVAL_*). */
function resolveCieLlmGatewayConfigured(): boolean {
  const p = resolveCieLlmProvider();
  if (p === "groq") {
    return Boolean(resolveCieGroqApiKey());
  }
  return Boolean(resolveCieGeminiApiKey());
}

/**
 * CIE can run without AI ranking eval: if `CIE_ENABLED` is unset but Groq/Gemini keys exist
 * for the active CIE provider, CIE is treated as enabled (common when only Groq is set for CIE).
 */
export function resolveCieEnabled(): boolean {
  const explicit = process.env.CIE_ENABLED?.trim().toLowerCase();
  if (explicit === "0" || explicit === "false" || explicit === "no") {
    return false;
  }
  if (explicit === "1" || explicit === "true" || explicit === "yes") {
    return true;
  }
  if (resolveCieLlmGatewayConfigured()) {
    return true;
  }
  return resolveAiEvalEnabled();
}

export function resolveCieModelVersion(): string {
  const provider = resolveCieLlmProvider();
  const model = provider === "groq" ? resolveCieGroqModel() : resolveCieGeminiModel();
  return `${provider}:${model}:${resolveCiePromptVersion()}:src=${resolveCieParserSource()}`;
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

async function postOpenAiChatOnce(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
  jsonResponseFormat?: boolean;
}): Promise<Response> {
  const body: Record<string, unknown> = {
    model: params.model,
    temperature: 0,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  };
  if (params.jsonResponseFormat !== false) {
    body.response_format = { type: "json_object" };
  }
  return fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });
}

async function postGeminiGenerateContent(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
  geminiBaseUrl?: string;
}): Promise<Response> {
  const base = (params.geminiBaseUrl ?? resolveCieGeminiBaseUrl()).replace(/\/$/, "");
  const modelId = normalizeGeminiModelId(params.model);
  const url = `${base}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
    signal: params.signal,
  });
}

function extractOpenAiChatText(body: unknown): string | null {
  const b = body as { choices?: Array<{ message?: { content?: string } }> };
  const raw = b.choices?.[0]?.message?.content;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function extractGeminiCandidateText(body: unknown): string | null {
  const apiErr = (body as { error?: { message?: string } }).error;
  if (apiErr?.message) return null;
  const candidates = (body as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  const parts = candidates?.[0]?.content?.parts;
  if (!parts?.length) return null;
  const t = parts.map((p) => p.text ?? "").join("");
  return t.trim() ? t : null;
}

export type CieLlmResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; detail?: string };

const cieAskResponseZ = z
  .object({
    answer: z.string().max(12_000),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export async function runCieReportLlm(input: {
  parsed: ParsedCandidate;
  targetRole?: string | null;
  /** Optional numeric hints from legacy `resume_parse_cache.parsedData` (not part of ParsedCandidate). */
  legacyParserHints?: LegacyParsedDataHints | null;
  logContext?: Record<string, unknown>;
}): Promise<CieLlmResult<CandidateReport>> {
  const ctx = input.logContext ?? {};
  if (!resolveCieEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  const provider = resolveCieLlmProvider();
  const apiKey =
    provider === "groq" ? resolveCieGroqApiKey() : resolveCieGeminiApiKey();
  if (!apiKey) {
    log("warn", "cie_llm_no_key", { ...ctx, provider });
    return { ok: false, reason: "no_api_key" };
  }

  const model = provider === "groq" ? resolveCieGroqModel() : resolveCieGeminiModel();
  const maxChars = resolveCieMaxUserChars();
  const hints = input.legacyParserHints;
  const payload: Record<string, unknown> = {
    parsedData: input.parsed,
    targetRole: input.targetRole ?? null,
  };
  if (
    hints &&
    (hints.experience_years != null || hints.notice_period_days != null)
  ) {
    payload.legacyParserHints = {
      experience_years: hints.experience_years,
      notice_period_days: hints.notice_period_days,
    };
  }
  let userJson = JSON.stringify(payload);
  if (userJson.length > maxChars) {
    userJson = userJson.slice(0, maxChars);
  }

//   const system = `You are a recruiting intelligence assistant. You ONLY use facts present in the JSON input "parsedData". Do not invent employers, degrees, skills, or dates that are not supported by parsedData.

// If "legacyParserHints" is present in the input JSON, you may use experience_years and notice_period_days from it as additional weak signals when inferring experienceLevel and timeline (still keep claims consistent with parsedData; do not contradict parsedData).

// Return ONE JSON object (no markdown) with exactly these keys:
// summary (string)
// strengths (string array)
// weaknesses (string array)
// primarySkills (string array) — must be subset of or clearly implied by parsedData.skills and experience/projects
// secondarySkills (string array)
// experienceLevel — one of: Fresher, Junior, Mid, Senior (infer primarily from parsedData; use legacyParserHints only as a weak tie-breaker when present)
// suitableRoles (string array)
// educationInsights: { relevance: "High"|"Medium"|"Low", notes: string }
// riskFlags (string array) — e.g. gaps, inconsistencies visible in structured data only
// confidenceScore (number 0-1) — your confidence that the structured input is sufficient

// If data is thin, lower confidenceScore and keep claims cautious.`;

const system = `You are a recruiting intelligence assistant. You will receive a JSON object with the key "parsedData".
This "parsedData" comes from a resume parser and has the following reliable structure (all fields are optional, but this defines what may be present):

{
  "core": {
    "skills": [{ "name": "…", "prov": { "source": "…", "confidence": … } }],
    "experience": [{
      "company": "…", "role": "…", "startDate": "YYYY-MM", "endDate": "YYYY-MM or null",
      "durationMonths": number or null, "bullets": ["…"], "techStack": ["…"],
      "prov": { "source": "…", "confidence": … }
    }],
    "projects": [{ "title": "…", "description": "…", "techStack": ["…"], "startDate": "…", "endDate": "…" }],
    "education": [{
      "degree": "…", "specialization": "…", "university": "…",
      "startDate": "YYYY-MM", "endDate": "YYYY-MM", "score": "…"
    }]
  },
  "rich": { "profiles": [{ "kind": "…", "url": "…" }] },
  "warnings": ["…"]
}

Optionally, a "total_experience_years" (number) or "legacyParserHints" (with "experience_years" and "notice_period_days") may be present at the top level.

YOUR TASK:
Using ONLY the information within "parsedData", generate a JSON object (no markdown, no code fences) with the following keys. Never invent employers, degrees, skills, or dates not present in parsedData.

1. summary (string)
   A 2–4 sentence professional summary covering current/latest role, top skills, key achievements, and what the candidate brings. Pull directly from experience[].role, experience[].bullets, and skills.

2. strengths (string array)
   Concrete, evidence‑based strengths derived from experience bullets, quantifiable results (e.g., “reduced latency by 30‑40%”), and skill depth. Each strength must cite at least one visible fact.

3. weaknesses (string array)
   Observable gaps or areas for improvement that are evident from the data: missing critical skills, length of employment gaps (>6 months between non-overlapping roles), or thin project descriptions. Be factual, not speculative.

4. primarySkills (string array)
   The 5–10 most important technical skills. Derive these from:
   - Skills explicitly listed in core.skills[].name
   - Technologies frequently appearing in experience[].techStack and projects[].techStack
   Prioritise skills that are central to the candidate’s main roles and that appear in multiple places.

5. secondarySkills (string array)
   Additional skills from core.skills or techStack arrays that are present but less central or less frequently used.

6. experienceLevel (string)
   One of: "Fresher", "Junior", "Mid", "Senior".
   Inference rules (in order of priority, all based solely on parsedData):
   a. Use total_experience_years if provided (sum of all professional experience durations).
   b. Otherwise, compute total years from experience[].startDate and endDate (treat null endDate as present month).
   c. Map years to level: <1: Fresher, 1–3: Junior, 3–7: Mid, >7: Senior.
   d. If job titles clearly indicate seniority (e.g., “Senior”, “Lead”, “Manager”) and years are borderline, you may upgrade one level.
   e. If legacyParserHints.experience_years exists and is the only numeric hint, use it cautiously as a weak tie‑breaker; do not contradict computed durations.

7. suitableRoles (string array)
   Up to 6 plausible job titles that this candidate could target, based on their primary skills, experience, and education (e.g., “Data Engineer”, “ETL Developer”, “Cloud Data Engineer”). Roles must be logically supported by the evidence.

8. educationInsights (object)
   { "relevance": "High|Medium|Low", "notes": "…" }
   - relevance: How well the candidate’s education (degrees, specialisations) aligns with their professional experience and primary skills.
   - notes: A brief rationale mentioning the most relevant degree or coursework (e.g., “Master’s in Business Data Analytics directly supports data roles”).

9. riskFlags (string array)
   List any inconsistencies or red flags visible in the structured data. Examples:
   - Employment gaps >6 months between non‑overlapping roles
   - Unusually short tenures (<6 months) without explanation
   - Mismatch between degree dates and experience (e.g., education overlapping with full‑time work)
   - Very low parser confidence scores on key fields (if confidence <0.7)
   Only report what can be objectively determined from the data; mark as riskFlags only when supported.

10. confidenceScore (number 0–1)
    Your overall confidence that the structured parsedData is sufficiently complete and accurate to make all the above inferences. Use these heuristics:
    - Start at 0.9, then deduct for missing critical sections (e.g., no experience, no skills).
    - Deduct slightly for very low parser confidences on key fields (e.g., name.confidence <0.7).
    - Deduct if the total years of experience are inconsistent or inferred with low certainty.
    - If data is thin (only one job, few skills), lower the score accordingly.

Finally: if the input contains a key "legacyParserHints", you may use experience_years and notice_period_days from it only as weak supplementary signals for experienceLevel and timeline where no conflict exists with parsedData. Do not let them override clear structured evidence.

Return only the JSON object. No additional text.`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), resolveCieTimeoutMs());
  const jsonMode = resolveCieOpenAiJsonResponseMode();

  let text: string | null = null;
  try {
    if (provider === "groq") {
      const res = await postOpenAiChatOnce({
        baseUrl: resolveCieGroqBaseUrl(),
        apiKey,
        model,
        system,
        user: userJson,
        signal: controller.signal,
        jsonResponseFormat: jsonMode,
      });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        return { ok: false, reason: "http_error", detail: JSON.stringify(body) };
      }
      text = extractOpenAiChatText(body);
    } else {
      const res = await postGeminiGenerateContent({
        apiKey,
        model,
        system,
        user: userJson,
        signal: controller.signal,
        geminiBaseUrl: resolveCieGeminiBaseUrl(),
      });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        return { ok: false, reason: "http_error", detail: JSON.stringify(body) };
      }
      text = extractGeminiCandidateText(body);
    }
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "network", detail: msg };
  }
  clearTimeout(t);

  if (!text?.trim()) {
    return { ok: false, reason: "empty_content" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const parsedOut = candidateReportZ.safeParse(raw);
  if (!parsedOut.success) {
    return { ok: false, reason: "schema_reject", detail: parsedOut.error.message };
  }
  return { ok: true, data: parsedOut.data };
}

export async function runCieAskLlm(input: {
  parsed: ParsedCandidate;
  report: CandidateReport | null;
  question: string;
  targetRole?: string | null;
  logContext?: Record<string, unknown>;
}): Promise<CieLlmResult<{ answer: string; confidence: number }>> {
  if (!resolveCieEnabled()) {
    return { ok: false, reason: "disabled" };
  }
  const provider = resolveCieLlmProvider();
  const apiKey =
    provider === "groq" ? resolveCieGroqApiKey() : resolveCieGeminiApiKey();
  if (!apiKey) {
    return { ok: false, reason: "no_api_key" };
  }

  const model = provider === "groq" ? resolveCieGroqModel() : resolveCieGeminiModel();
  const maxChars = resolveCieMaxUserChars();
  const payload = {
    parsedData: input.parsed,
    candidateReport: input.report,
    targetRole: input.targetRole ?? null,
    question: input.question.trim().slice(0, 2000),
  };
  let userJson = JSON.stringify(payload);
  if (userJson.length > maxChars) {
    userJson = userJson.slice(0, maxChars);
  }

  const system = `You answer recruiter questions using ONLY candidateReport and parsedData in the JSON input. If you cannot answer from that data, say so and suggest what resume detail is missing.

Return ONE JSON object with keys: answer (string), confidence (number 0-1).`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), resolveCieTimeoutMs());
  const jsonMode = resolveCieOpenAiJsonResponseMode();

  let text: string | null = null;
  try {
    if (provider === "groq") {
      const res = await postOpenAiChatOnce({
        baseUrl: resolveCieGroqBaseUrl(),
        apiKey,
        model,
        system,
        user: userJson,
        signal: controller.signal,
        jsonResponseFormat: jsonMode,
      });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        return { ok: false, reason: "http_error", detail: JSON.stringify(body) };
      }
      text = extractOpenAiChatText(body);
    } else {
      const res = await postGeminiGenerateContent({
        apiKey,
        model,
        system,
        user: userJson,
        signal: controller.signal,
        geminiBaseUrl: resolveCieGeminiBaseUrl(),
      });
      const body = (await res.json()) as unknown;
      if (!res.ok) {
        return { ok: false, reason: "http_error", detail: JSON.stringify(body) };
      }
      text = extractGeminiCandidateText(body);
    }
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "network", detail: msg };
  }
  clearTimeout(t);

  if (!text?.trim()) {
    return { ok: false, reason: "empty_content" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const parsedOut = cieAskResponseZ.safeParse(raw);
  if (!parsedOut.success) {
    return { ok: false, reason: "schema_reject", detail: parsedOut.error.message };
  }
  return { ok: true, data: parsedOut.data };
}
