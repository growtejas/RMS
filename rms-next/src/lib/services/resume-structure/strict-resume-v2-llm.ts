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

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

/**
 * LLMs occasionally omit nullable/required container keys even with strict prompts.
 * Normalize a few known omissions before Zod validation.
 */
function normalizeStrictResumeV2Candidate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const doc = { ...(raw as Record<string, unknown>) };
  const core =
    doc.core && typeof doc.core === "object"
      ? { ...(doc.core as Record<string, unknown>) }
      : null;

  if (core) {
    if (!Array.isArray(core.education)) {
      core.education = [];
    }
    if (Array.isArray(core.projects)) {
      core.projects = core.projects.map((p) => {
        if (!p || typeof p !== "object") return p;
        const row = { ...(p as Record<string, unknown>) };
        if (row.link === undefined) {
          row.link = null;
        }
        return row;
      });
    }
    doc.core = core;
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

export type StrictResumeV2RunReason =
  | "disabled"
  | "no_api_key"
  | "no_text"
  | "http"
  | "empty"
  | "json"
  | "zod";

/**
 * Adaptive v2 LLM parse from raw resume text.
 * Reuses RESUME_STRUCTURE_OPENAI_* (key/base/model/timeout/max-chars).
 * Independent gate: `RESUME_STRUCTURE_V2_ENABLED` (does NOT require RESUME_STRUCTURE_LLM_ENABLED).
 */
export async function runStrictResumeV2FromText(input: {
  resumeText: string;
  logContext?: Record<string, unknown>;
}): Promise<
  | { ok: true; data: StrictResumeV2 }
  | { ok: false; reason: StrictResumeV2RunReason }
> {
  const ctx = input.logContext ?? {};
  if (!resolveResumeStructureV2Enabled()) {
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

  const userPayload = JSON.stringify({ resume_text: excerpt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
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

    const res = await fetch(`${baseUrl}/chat/completions`, {
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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("warn", "strict_resume_v2_http_error", {
        ...ctx,
        status: res.status,
        duration_ms: Date.now() - started,
        body_excerpt: errText.slice(0, 200),
      });
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

    log("info", "strict_resume_v2_ok", {
      ...ctx,
      model,
      duration_ms: Date.now() - started,
      profile_type: validated.data.profile_type,
      skills: validated.data.core.skills.length,
      experience: validated.data.core.experience.length,
      projects: validated.data.core.projects.length,
      education: validated.data.core.education.length,
    });
    return { ok: true, data: validated.data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    log("warn", "strict_resume_v2_failed", {
      ...ctx,
      aborted,
      duration_ms: Date.now() - started,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { ok: false, reason: "http" };
  } finally {
    clearTimeout(timer);
  }
}
