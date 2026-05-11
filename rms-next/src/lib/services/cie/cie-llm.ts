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
  candidateReportLlmZ,
  finalizeCandidateReportLlm,
  type CandidateReport,
  type ParsedCandidate,
} from "@/lib/services/cie/cie.schema";
import type { LegacyParsedDataHints } from "@/lib/services/cie/parsed-candidate-from-legacy-parsed-data";
import {
  resolveCieStrictLlmParse,
  resolveCieStrictLlmParseOverrideV2,
} from "@/lib/services/resume-structure/strict-llm-resume-parse";
import {
  resolveCieResumeV2Parse,
  resolveResumeStructureV2Enabled,
} from "@/lib/services/resume-structure/strict-resume-v2-llm";
import type { StrictResumeV2 } from "@/lib/services/resume-structure/strict-resume-v2.schema";
import { v2ToProcessorPayload } from "@/lib/services/resume-structure/strict-resume-v2-mapper";
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
  const raw = `${resumeContentHash ?? "none"}:${resolveCieParserSource()}:v2_${resolveResumeStructureV2Enabled() ? "on" : "off"}:cie_v2_${resolveCieResumeV2Parse() ? "on" : "off"}:strict_${resolveCieStrictLlmParse() ? "on" : "off"}:strict_ov_v2_${resolveCieStrictLlmParseOverrideV2() ? "on" : "off"}:cie_snap_v2pref:rich_v2_persisted:cie_canonical_v2:v1`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * When true (default), strict v1 LLM parse is allowed inside the canonical write path.
 * Set `CIE_ALLOW_STRICT_V1=false` to fully disable strict v1 in CIE persistence.
 */
export function resolveCieAllowStrictV1(): boolean {
  const v = process.env.CIE_ALLOW_STRICT_V1?.trim().toLowerCase();
  if (v === undefined || v === "") return false;
  return v === "1" || v === "true" || v === "yes";
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

function cieLlmSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveCie429MaxRetries(): number {
  const n = Number(process.env.CIE_LLM_429_MAX_RETRIES ?? "8");
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : 8;
}

function resolveCie429BackoffCapMs(): number {
  const n = Number(process.env.CIE_LLM_429_BACKOFF_CAP_MS ?? "120000");
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 300_000) : 120_000;
}

/** Groq error bodies often include `Please try again in 22.5s`. */
function groq429BackoffFromMessage(detail: string): number {
  const m = detail.match(/try again in ([\d.]+)\s*s/i);
  if (m) {
    const sec = Number.parseFloat(m[1]);
    if (Number.isFinite(sec)) {
      return Math.min(resolveCie429BackoffCapMs(), Math.max(1_000, Math.ceil(sec * 1_250)));
    }
  }
  return Math.min(resolveCie429BackoffCapMs(), 5_000);
}

type GroqChatAttempt =
  | { ok: true; body: unknown }
  | { ok: false; reason: "http_error"; detail: string }
  | { ok: false; reason: "network"; detail: string };

async function groqOpenAiChatWithRetries(
  params: Omit<Parameters<typeof postOpenAiChatOnce>[0], "signal"> & {
    logContext: Record<string, unknown>;
  },
): Promise<GroqChatAttempt> {
  const max = resolveCie429MaxRetries();
  for (let attempt = 0; attempt <= max; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolveCieTimeoutMs());
    try {
      const res = await postOpenAiChatOnce({
        ...params,
        signal: controller.signal,
      });
      let body: unknown;
      try {
        body = (await res.json()) as unknown;
      } catch {
        return {
          ok: false,
          reason: "http_error",
          detail: JSON.stringify({ error: "invalid_json", status: res.status }),
        };
      }
      if (res.ok) {
        return { ok: true, body };
      }
      const detail = JSON.stringify(body);
      const retryableHttp =
        res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryableHttp && attempt < max) {
        const wait =
          res.status === 429
            ? groq429BackoffFromMessage(detail)
            : Math.min(30_000, 2000 * (attempt + 1));
        log("warn", "cie_groq_transient_backoff", {
          ...params.logContext,
          attempt,
          http_status: res.status,
          wait_ms: wait,
        });
        await cieLlmSleep(wait);
        continue;
      }
      return { ok: false, reason: "http_error", detail };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = e instanceof Error && e.name === "AbortError";
      if (aborted && attempt < max) {
        await cieLlmSleep(Math.min(10_000, 2000 * (attempt + 1)));
        continue;
      }
      return { ok: false, reason: "network", detail: msg };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: "http_error", detail: '{"error":"groq_retries_exhausted"}' };
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

/**
 * Pure builder for the CIE report LLM user-message payload. Exported for unit tests so we can
 * assert the v2-vs-flat preference and `parsedDataKind` discriminator without spinning up an LLM.
 *
 * When `parsedV2` is available, the payload uses the richer `strict_resume_v2_processor`
 * projection (bullets, per-job tech stack, structured dates, prov.confidence, top-level
 * `total_experience_years`, warnings). The lossy `parsed_candidate_flat` shape is kept ONLY
 * as a last-resort escape for candidates where v2 has never succeeded.
 */
export function buildCieReportPayload(input: {
  parsed: ParsedCandidate;
  parsedV2: StrictResumeV2 | null;
  targetRole: string | null;
  legacyParserHints: LegacyParsedDataHints | null;
  /** Candidate id surfaced inside the processor payload (helpful for trace/debug logs). */
  candidateId?: number | null;
}): Record<string, unknown> {
  let payload: Record<string, unknown>;
  if (input.parsedV2) {
    const processor = v2ToProcessorPayload({
      doc: input.parsedV2,
      candidateId: input.candidateId ?? 0,
    });
    payload = {
      parsedData: processor,
      parsedDataKind: "strict_resume_v2_processor",
      total_experience_years: processor.profile.total_experience_years,
      targetRole: input.targetRole ?? null,
    };
  } else {
    payload = {
      parsedData: input.parsed,
      parsedDataKind: "parsed_candidate_flat",
      targetRole: input.targetRole ?? null,
    };
  }
  const hints = input.legacyParserHints;
  if (
    hints &&
    (hints.experience_years != null || hints.notice_period_days != null)
  ) {
    payload.legacyParserHints = {
      experience_years: hints.experience_years,
      notice_period_days: hints.notice_period_days,
    };
  }
  return payload;
}

export async function runCieReportLlm(input: {
  parsed: ParsedCandidate;
  /**
   * Rich `StrictResumeV2` snapshot (bullets, dates, techStack, prov). Preferred over flat `parsed`
   * when available; the system prompt already documents `core` + `prov`, so feeding v2 directly
   * yields higher-fidelity reports.
   */
  parsedV2?: StrictResumeV2 | null;
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
  const payload = buildCieReportPayload({
    parsed: input.parsed,
    parsedV2: input.parsedV2 ?? null,
    targetRole: input.targetRole ?? null,
    legacyParserHints: input.legacyParserHints ?? null,
    candidateId:
      typeof ctx.candidate_id === "number" ? (ctx.candidate_id as number) : null,
  });
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

const system = `You are a recruiting intelligence assistant. You will receive a JSON object with the key "parsedData" and a sibling string key "parsedDataKind".

When parsedDataKind === "strict_resume_v2_processor", parsedData follows the canonical v2 processor contract documented below (contact/skills/experience/projects/education + per-row confidence + quality.warnings + profile.total_experience_years).
When parsedDataKind === "strict_resume_v2", parsedData follows the rich v2 contract (core/rich/warnings + per-field prov) — same fields as the processor shape but namespaced under \`core\`.
When parsedDataKind === "parsed_candidate_flat", parsedData is a simplified flat shape: { basicInfo:{name,email,phone}, skills:string[], projects:[{title,description,techStack}], experience:[{company,role,years}], education:[{degree,specialization,university,year,score}] }. In that case ignore guidance below that references bullets, techStack, startDate/endDate, or confidence, and base inferences only on the available flat fields.

The canonical "strict_resume_v2_processor" parsedData has this shape (every list may be empty; never invent data):

{
  "schema": "candidate_processor_v1",
  "candidate_id": number,
  "generated_at": ISO timestamp,
  "profile": { "type": "fresher|mid|senior|academic|managerial|unknown", "type_confidence": 0..1, "total_experience_years": number|null },
  "contact": { "name": string|null, "email": string|null, "phone": string|null, "location": string|null },
  "skills": string[],
  "experience": [{
    "company": string, "role": string,
    "start_date": "YYYY-MM"|null, "end_date": "YYYY-MM"|null, "duration_months": number|null,
    "highlights": string[],   // bullet-level achievements; PRIMARY evidence source
    "tech_stack": string[],
    "confidence": 0..1
  }],
  "projects": [{
    "title": string, "description": string, "tech_stack": string[],
    "start_date": "YYYY-MM"|null, "end_date": "YYYY-MM"|null, "confidence": 0..1
  }],
  "education": [{
    "degree": string, "specialization": string|null, "university": string,
    "year": number|null, "score": string|null, "confidence": 0..1
  }],
  "extras": { "achievements": [{ "title": string, "description": string|null }], "profiles": [{ "kind": string, "url": string }] },
  "quality": { "warnings": string[], "source": "parsed_candidate_v2" }
}

Optionally, a "total_experience_years" (number) or "legacyParserHints" (with "experience_years" and "notice_period_days") may be present at the top level.

YOUR TASK:
Using ONLY the information within "parsedData", generate a JSON object (no markdown, no code fences) with the following keys. Never invent employers, degrees, skills, or dates not present in parsedData.

1. summary (string)
   A 2–4 sentence professional summary covering current/latest role, top skills, key achievements, and what the candidate brings. Pull directly from experience[].role, experience[].highlights (a.k.a. bullets), and skills.

2. strengths (string array)
   Concrete, evidence‑based strengths derived from experience highlights/bullets, quantifiable results (e.g., “reduced latency by 30‑40%”), and skill depth. Each strength must cite at least one visible fact.

3 weaknesses (string array)

Generate ONLY evidence-based and objectively observable areas for improvement from the structured candidate data.

Allowed weakness sources:
- Missing critical technical skills relative to the candidate’s apparent target role
- Employment gaps longer than 6 months between non-overlapping roles
- Missing or inconsistent date/duration information
- Thin project descriptions lacking implementation depth or measurable outcomes
- Limited evidence of deployment, scalability, testing, architecture, or production ownership
- Limited evidence of leadership or mentorship responsibilities for mid/senior profiles
- Skill claims with weak supporting evidence from projects or experience

Rules:
- Every weakness MUST be directly supported by structured resume evidence
- Do NOT generate weaknesses contradicted by the data
- Do NOT claim missing education if formal degrees exist
- Do NOT claim missing project detail if projects contain measurable outcomes, technical implementation details, or quantified impact
- Do NOT speculate about personality, communication, motivation, confidence, or culture fit
- Prefer factual observations over subjective criticism
- Keep wording professional, concise, and defensible
- If no meaningful weaknesses exist, return an empty array

Good examples:
- "Current role duration is not fully calculable because the position is ongoing."
- "Resume emphasizes technical execution more than leadership or mentorship responsibilities."
- "Limited evidence of automated testing or CI/CD practices was identified."

Bad examples:
- "No formal university degree listed."
- "Project details are missing."
- "Needs better communication skills."
- "Lacks confidence."

4. primarySkills (string array)
   The 5–10 most important technical skills. Derive these from:
   - Skills explicitly listed in skills[] (or core.skills[].name)
   - Technologies frequently appearing in experience[].tech_stack (or techStack) and projects[].tech_stack
   Prioritise skills that are central to the candidate’s main roles and that appear in multiple places.

5. secondarySkills (string array)
   Additional skills from skills[] or tech_stack arrays that are present but less central or less frequently used.

6. experienceLevel (string)
   One of: "Fresher", "Junior", "Mid", "Senior".
   Inference rules (in order of priority, all based solely on parsedData):
   a. Use profile.total_experience_years (or top-level total_experience_years) if provided.
   b. Otherwise, compute total years from experience[].start_date / end_date (treat null end_date as present month). Use duration_months when present.
   c. Map years to level: <1: Fresher, 1–3: Junior, 3–7: Mid, >7: Senior.
   d. If job titles clearly indicate seniority (e.g., “Senior”, “Lead”, “Manager”) and years are borderline, you may upgrade one level.
   e. If legacyParserHints.experience_years exists and is the only numeric hint, use it cautiously as a weak tie‑breaker; do not contradict computed durations.

7. suitableRoles (array of objects)
   Up to 6 plausible job titles this candidate could target, based on primary skills, experience, and education. Each item MUST be exactly: { "displayName": string, "confidence": number between 0 and 1 }.
   Rank by fit (highest confidence first). Do NOT include roleId. displayName should be a conventional job title (e.g. "Data Engineer", "Backend Engineer"). Roles must be logically supported by the evidence.

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

  const jsonMode = resolveCieOpenAiJsonResponseMode();

  let text: string | null = null;
  try {
    if (provider === "groq") {
      const groq = await groqOpenAiChatWithRetries({
        baseUrl: resolveCieGroqBaseUrl(),
        apiKey,
        model,
        system,
        user: userJson,
        jsonResponseFormat: jsonMode,
        logContext: ctx,
      });
      if (!groq.ok) {
        return {
          ok: false,
          reason: groq.reason === "network" ? "network" : "http_error",
          detail: groq.detail,
        };
      }
      text = extractOpenAiChatText(groq.body);
    } else {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), resolveCieTimeoutMs());
      try {
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
      } finally {
        clearTimeout(t);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "network", detail: msg };
  }

  if (!text?.trim()) {
    return { ok: false, reason: "empty_content" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFence(text));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const parsedOut = candidateReportLlmZ.safeParse(raw);
  if (!parsedOut.success) {
    return { ok: false, reason: "schema_reject", detail: parsedOut.error.message };
  }
  try {
    return { ok: true, data: finalizeCandidateReportLlm(parsedOut.data) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "schema_reject", detail: msg };
  }
}

export async function runCieAskLlm(input: {
  parsed: ParsedCandidate;
  /** Rich v2 snapshot. Used as the primary `parsedData` when present. */
  parsedV2?: StrictResumeV2 | null;
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
  const askUsingRichV2 = Boolean(input.parsedV2);
  const payload = {
    parsedData: askUsingRichV2 ? input.parsedV2 : input.parsed,
    parsedDataKind: askUsingRichV2 ? "strict_resume_v2" : "parsed_candidate_flat",
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

  const ctx = input.logContext ?? {};
  const jsonMode = resolveCieOpenAiJsonResponseMode();

  let text: string | null = null;
  try {
    if (provider === "groq") {
      const groq = await groqOpenAiChatWithRetries({
        baseUrl: resolveCieGroqBaseUrl(),
        apiKey,
        model,
        system,
        user: userJson,
        jsonResponseFormat: jsonMode,
        logContext: ctx,
      });
      if (!groq.ok) {
        return {
          ok: false,
          reason: groq.reason === "network" ? "network" : "http_error",
          detail: groq.detail,
        };
      }
      text = extractOpenAiChatText(groq.body);
    } else {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), resolveCieTimeoutMs());
      try {
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
      } finally {
        clearTimeout(t);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "network", detail: msg };
  }

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
