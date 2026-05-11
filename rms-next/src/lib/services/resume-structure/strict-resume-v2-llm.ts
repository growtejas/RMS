import { log } from "@/lib/logging/logger";
import {
  parseStrictResumeV2Json,
  STRICT_RESUME_V2_SYSTEM_PROMPT,
  type StrictResumeV2,
} from "@/lib/services/resume-structure/strict-resume-v2.schema";

function resolveTimeoutMs(): number {
  const n = Number(process.env.RESUME_STRUCTURE_LLM_TIMEOUT_MS ?? "28000");
  return Number.isFinite(n) && n >= 3000 ? Math.min(n, 120_000) : 28_000;
}

function strictV2Sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveStrictResume429MaxRetries(): number {
  const n = Number(process.env.RESUME_STRUCTURE_429_MAX_RETRIES ?? "8");
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 30) : 8;
}

function resolveStrictResume429BackoffCapMs(): number {
  const n = Number(process.env.RESUME_STRUCTURE_429_BACKOFF_CAP_MS ?? "120000");
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 300_000) : 120_000;
}

function openAiCompat429BackoffFromBody(errBody: string): number {
  const m = errBody.match(/try again in ([\d.]+)\s*s/i);
  if (m) {
    const sec = Number.parseFloat(m[1]);
    if (Number.isFinite(sec)) {
      return Math.min(
        resolveStrictResume429BackoffCapMs(),
        Math.max(1_000, Math.ceil(sec * 1_250)),
      );
    }
  }
  return Math.min(resolveStrictResume429BackoffCapMs(), 5_000);
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

/**
 * Valid `prov.source` enum values per `strict-resume-v2.schema.ts`.
 * Anything outside this list is coerced to "unknown" before Zod validation.
 */
const V2_VALID_PROV_SOURCES = new Set<string>([
  "rules",
  "llm",
  "hybrid",
  "header",
  "skills_section",
  "experience_section",
  "projects_section",
  "education_section",
  "achievements_section",
  "certifications_section",
  "publications_section",
  "patents_section",
  "profiles_section",
  "leadership_section",
  "languages_section",
  "awards_section",
  "unknown",
]);

/**
 * Coerce a date-like value to the strict YYYY-MM contract or `null`.
 * - `undefined` / empty → `null`
 * - `"YYYY"` → `null` (year-only is too coarse for ranking; better to drop)
 * - `"YYYY-M"` → `"YYYY-0M"`
 * - already `"YYYY-MM"` → unchanged
 * - any other string → `null`
 */
function coerceV2YearMonth(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
  const single = trimmed.match(/^(\d{4})-(\d)$/);
  if (single) {
    const [, y, m] = single;
    return `${y}-0${m}`;
  }
  return null;
}

function coerceV2Prov(raw: unknown): { source: string; confidence: number } {
  if (!raw || typeof raw !== "object") {
    return { source: "unknown", confidence: 0 };
  }
  const obj = raw as Record<string, unknown>;
  const sourceRaw = typeof obj.source === "string" ? obj.source.trim() : "";
  const source = V2_VALID_PROV_SOURCES.has(sourceRaw) ? sourceRaw : "unknown";
  const confRaw = typeof obj.confidence === "number" ? obj.confidence : 0;
  const confidence = Math.max(0, Math.min(1, Number.isFinite(confRaw) ? confRaw : 0));
  return { source, confidence };
}

/**
 * LLMs occasionally omit nullable keys, write year-only dates, hallucinate prov.source
 * values outside the enum, or attach prov to rows where the schema doesn't allow it.
 * Smooth those over before Zod runs so we don't reject otherwise-usable parses.
 */
function normalizeStrictResumeV2Candidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = { ...(raw as Record<string, unknown>) };
  const core =
    doc.core && typeof doc.core === "object"
      ? { ...(doc.core as Record<string, unknown>) }
      : null;

  if (core) {
    if (core.basicInfo && typeof core.basicInfo === "object") {
      const bi = { ...(core.basicInfo as Record<string, unknown>) };
      for (const k of ["name", "email", "phone", "location", "headline"] as const) {
        const cell = bi[k];
        if (cell && typeof cell === "object") {
          const c = { ...(cell as Record<string, unknown>) };
          c.prov = coerceV2Prov(c.prov);
          if (c.value === undefined) c.value = null;
          bi[k] = c;
        }
      }
      core.basicInfo = bi;
    }

    if (Array.isArray(core.skills)) {
      core.skills = core.skills.map((s) => {
        if (!s || typeof s !== "object") return s;
        const row = { ...(s as Record<string, unknown>) };
        row.prov = coerceV2Prov(row.prov);
        return row;
      });
    }

    if (Array.isArray(core.experience)) {
      core.experience = core.experience.map((e) => {
        if (!e || typeof e !== "object") return e;
        const row = { ...(e as Record<string, unknown>) };
        row.startDate = coerceV2YearMonth(row.startDate);
        row.endDate = coerceV2YearMonth(row.endDate);
        if (row.location === undefined) row.location = null;
        if (row.durationMonths === undefined) row.durationMonths = null;
        if (!Array.isArray(row.bullets)) row.bullets = [];
        if (!Array.isArray(row.techStack)) row.techStack = [];
        row.prov = coerceV2Prov(row.prov);
        return row;
      });
    }

    if (!Array.isArray(core.education)) {
      core.education = [];
    } else {
      core.education = core.education.map((ed) => {
        if (!ed || typeof ed !== "object") return ed;
        const row = { ...(ed as Record<string, unknown>) };
        row.startDate = coerceV2YearMonth(row.startDate);
        row.endDate = coerceV2YearMonth(row.endDate);
        if (row.specialization === undefined) row.specialization = null;
        if (row.score === undefined) row.score = null;
        if (row.location === undefined) row.location = null;
        if (row.year === undefined) row.year = null;
        row.prov = coerceV2Prov(row.prov);
        return row;
      });
    }

    if (Array.isArray(core.projects)) {
      core.projects = core.projects.map((p) => {
        if (!p || typeof p !== "object") return p;
        const row = { ...(p as Record<string, unknown>) };
        row.startDate = coerceV2YearMonth(row.startDate);
        row.endDate = coerceV2YearMonth(row.endDate);
        if (row.link === undefined) row.link = null;
        if (typeof row.link === "string" && !row.link.trim()) row.link = null;
        if (!Array.isArray(row.techStack)) row.techStack = [];
        row.prov = coerceV2Prov(row.prov);
        return row;
      });
    }
    doc.core = core;
  }

  // `rich.profiles` rows: drop schema-illegal `prov` key, coerce null/empty url to dropped row.
  if (doc.rich && typeof doc.rich === "object") {
    const rich = { ...(doc.rich as Record<string, unknown>) };
    if (Array.isArray(rich.profiles)) {
      rich.profiles = rich.profiles
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const row = { ...(p as Record<string, unknown>) };
          delete row.prov;
          if (typeof row.url !== "string" || !row.url.trim()) return null;
          return row;
        })
        .filter((p) => p !== null);
    }
    doc.rich = rich;
  }

  if (!Array.isArray(doc.warnings)) {
    doc.warnings = [];
  }
  return doc;
}

export function resolveResumeStructureV2Enabled(): boolean {
  const v = process.env.RESUME_STRUCTURE_V2_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * When true, CIE runs the same adaptive v2 resume LLM parse as
 * GET /api/candidates/:id/parsed-resume?v2=1 (in addition to `RESUME_STRUCTURE_V2_ENABLED`).
 */
export function resolveCieResumeV2Parse(): boolean {
  const v = process.env.CIE_RESUME_V2_PARSE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type StrictResumeV2RunReason =
  | "disabled"
  | "no_api_key"
  | "no_text"
  | "http"
  | "empty"
  | "json"
  | "zod";

/**
 * Walk every `prov.confidence` in a v2 document and return a summary so callers
 * can record min / median for observability and integrity checks.
 */
function collectV2ProvConfidences(doc: StrictResumeV2): {
  min: number | null;
  median: number | null;
  count: number;
} {
  const buf: number[] = [];
  const c = doc.core;
  for (const k of ["name", "email", "phone", "location", "headline"] as const) {
    const f = (c.basicInfo as unknown as Record<string, { prov?: { confidence?: number } } | undefined>)[k];
    const v = f?.prov?.confidence;
    if (typeof v === "number" && Number.isFinite(v)) buf.push(v);
  }
  for (const s of c.skills) {
    if (typeof s.prov?.confidence === "number" && Number.isFinite(s.prov.confidence)) {
      buf.push(s.prov.confidence);
    }
  }
  for (const e of c.experience) {
    if (typeof e.prov?.confidence === "number" && Number.isFinite(e.prov.confidence)) {
      buf.push(e.prov.confidence);
    }
  }
  for (const p of c.projects) {
    if (typeof p.prov?.confidence === "number" && Number.isFinite(p.prov.confidence)) {
      buf.push(p.prov.confidence);
    }
  }
  for (const ed of c.education) {
    if (typeof ed.prov?.confidence === "number" && Number.isFinite(ed.prov.confidence)) {
      buf.push(ed.prov.confidence);
    }
  }
  if (buf.length === 0) return { min: null, median: null, count: 0 };
  const sorted = [...buf].sort((a, b) => a - b);
  const min = sorted[0]!;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { min, median, count: sorted.length };
}

export type StrictResumeV2OkPayload = {
  ok: true;
  data: StrictResumeV2;
  /** True when raw resume text exceeded the configured input cap. */
  truncated: boolean;
  /** Length of the raw resume text passed in (after trim). */
  rawChars: number;
  /** Length of the excerpt actually sent to the LLM. */
  usedChars: number;
  /** Smallest per-field prov.confidence observed in the resulting v2 document. */
  provMin: number | null;
  /** Median per-field prov.confidence across all sections. */
  provMedian: number | null;
};

/**
 * Adaptive v2 LLM parse from raw resume text.
 * Reuses RESUME_STRUCTURE_OPENAI_* (key/base/model/timeout/max-chars).
 * Independent gate: `RESUME_STRUCTURE_V2_ENABLED` (does NOT require RESUME_STRUCTURE_LLM_ENABLED).
 */
export async function runStrictResumeV2FromText(input: {
  resumeText: string;
  logContext?: Record<string, unknown>;
  /**
   * Per-request bypass of `RESUME_STRUCTURE_V2_ENABLED` (e.g. GET ?v2=1 or CIE when `CIE_RESUME_V2_PARSE` is on).
   */
  bypassResumeStructureV2EnabledGate?: boolean;
}): Promise<
  | StrictResumeV2OkPayload
  | { ok: false; reason: StrictResumeV2RunReason }
> {
  const ctx = input.logContext ?? {};
  const allow =
    resolveResumeStructureV2Enabled() ||
    input.bypassResumeStructureV2EnabledGate === true;
  if (!allow) {
    return { ok: false, reason: "disabled" };
  }
  const raw = input.resumeText?.trim() ?? "";
  if (!raw) {
    return { ok: false, reason: "no_text" };
  }
  const apiKey = process.env.RESUME_STRUCTURE_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    log("info", "strict_resume_v2_skipped", { ...ctx, reason: "no_api_key" });
    return { ok: false, reason: "no_api_key" };
  }

  const baseUrl = (
    process.env.RESUME_STRUCTURE_OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.RESUME_STRUCTURE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const maxChars =
    Number(process.env.RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS ?? "14000") || 14_000;
  const excerpt = raw.slice(0, Math.min(maxChars, 100_000));
  const rawChars = raw.length;
  const usedChars = excerpt.length;
  const truncated = rawChars > usedChars;
  if (truncated) {
    log("warn", "strict_resume_v2_truncated", {
      ...ctx,
      raw_chars: rawChars,
      used_chars: usedChars,
      max_chars_cap: maxChars,
    });
  }

  const userPayload = JSON.stringify({ resume_text: excerpt });

  const started = Date.now();
  try {
    log("info", "strict_resume_v2_request_start", {
      ...ctx,
      model,
      base_host: (() => {
        try {
          return new URL(baseUrl).host;
        } catch {
          return "invalid_base_url";
        }
      })(),
    });

    const max429 = resolveStrictResume429MaxRetries();
    let res: Response | undefined;
    for (let attempt = 0; attempt <= max429; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.05,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: STRICT_RESUME_V2_SYSTEM_PROMPT },
              { role: "user", content: userPayload },
            ],
          }),
          signal: controller.signal,
        });
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        if (aborted && attempt < max429) {
          const wait = Math.min(10_000, 2000 * (attempt + 1));
          log("warn", "strict_resume_v2_transient_backoff", {
            ...ctx,
            attempt,
            wait_ms: wait,
            note: "abort",
          });
          await strictV2Sleep(wait);
          continue;
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        break;
      }

      const errText = await res.text().catch(() => "");
      const retryable =
        (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt < max429;
      if (retryable) {
        const wait =
          res.status === 429
            ? openAiCompat429BackoffFromBody(errText)
            : Math.min(30_000, 2000 * (attempt + 1));
        log("warn", "strict_resume_v2_transient_backoff", {
          ...ctx,
          attempt,
          http_status: res.status,
          wait_ms: wait,
        });
        await strictV2Sleep(wait);
        continue;
      }

      log("warn", "strict_resume_v2_http_error", {
        ...ctx,
        status: res.status,
        duration_ms: Date.now() - started,
        body_excerpt: errText.slice(0, 200),
      });
      return { ok: false, reason: "http" };
    }

    if (!res?.ok) {
      return { ok: false, reason: "http" };
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = body.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      log("warn", "strict_resume_v2_empty_content", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return { ok: false, reason: "empty" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(rawContent));
    } catch {
      log("warn", "strict_resume_v2_json_error", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return { ok: false, reason: "json" };
    }

    const normalized = normalizeStrictResumeV2Candidate(parsed);
    const validated = parseStrictResumeV2Json(normalized);
    if (!validated.ok) {
      log("warn", "strict_resume_v2_zod_reject", {
        ...ctx,
        duration_ms: Date.now() - started,
        issues: validated.error.issues.slice(0, 8),
      });
      return { ok: false, reason: "zod" };
    }

    const provStats = collectV2ProvConfidences(validated.data);
    log("info", "strict_resume_v2_ok", {
      ...ctx,
      model,
      duration_ms: Date.now() - started,
      profile_type: validated.data.profile_type,
      skills: validated.data.core.skills.length,
      experience: validated.data.core.experience.length,
      projects: validated.data.core.projects.length,
      education: validated.data.core.education.length,
      truncated,
      raw_chars: rawChars,
      used_chars: usedChars,
      prov_min: provStats.min,
      prov_median: provStats.median,
    });
    return {
      ok: true,
      data: validated.data,
      truncated,
      rawChars,
      usedChars,
      provMin: provStats.min,
      provMedian: provStats.median,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    log("warn", "strict_resume_v2_failed", {
      ...ctx,
      aborted,
      duration_ms: Date.now() - started,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { ok: false, reason: "http" };
  }
}
