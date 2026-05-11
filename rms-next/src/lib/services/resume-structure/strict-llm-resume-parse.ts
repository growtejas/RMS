import { log } from "@/lib/logging/logger";
import {
  parseStrictLlmResumeJson,
  STRICT_LLM_RESUME_PARSE_SYSTEM_PROMPT,
  type StrictLlmResumeParse,
} from "@/lib/services/resume-structure/strict-llm-resume-parse.schema";

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

export type ResumeStructureLlmMode = "legacy" | "strict_v1";

export function resolveResumeStructureLlmMode(): ResumeStructureLlmMode {
  const v = process.env.RESUME_STRUCTURE_LLM_MODE?.trim().toLowerCase();
  return v === "strict_v1" ? "strict_v1" : "legacy";
}

export function resolveCieStrictLlmParse(): boolean {
  const v = process.env.CIE_STRICT_LLM_PARSE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When false (default), strict LLM parse must not replace a successful v2→ParsedCandidate projection. */
export function resolveCieStrictLlmParseOverrideV2(): boolean {
  const v = process.env.CIE_STRICT_LLM_PARSE_OVERRIDE_V2?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * OpenAI-compatible JSON parse of resume text into `StrictLlmResumeParse`.
 * Uses RESUME_STRUCTURE_OPENAI_*.
 * When `bypassStructureLlmEnabledGate` is true and `CIE_STRICT_LLM_PARSE` is set, runs even if
 * `RESUME_STRUCTURE_LLM_ENABLED` is off (CIE-only path).
 */
export async function runStrictResumeParseFromText(input: {
  resumeText: string;
  draftProfile?: unknown;
  draftWarnings?: string[];
  logContext?: Record<string, unknown>;
  bypassStructureLlmEnabledGate?: boolean;
}): Promise<
  | { ok: true; data: StrictLlmResumeParse }
  | { ok: false; reason: "disabled" | "no_api_key" | "http" | "empty" | "json" | "zod" }
> {
  const ctx = input.logContext ?? {};
  const structureLlmOn =
    process.env.RESUME_STRUCTURE_LLM_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.RESUME_STRUCTURE_LLM_ENABLED?.trim() === "1";
  const cieBypass =
    input.bypassStructureLlmEnabledGate === true && resolveCieStrictLlmParse();
  if (!structureLlmOn && !cieBypass) {
    return { ok: false, reason: "disabled" };
  }
  const apiKey = process.env.RESUME_STRUCTURE_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    log("info", "strict_llm_resume_parse_skipped", { ...ctx, reason: "no_api_key" });
    return { ok: false, reason: "no_api_key" };
  }

  const baseUrl = (
    process.env.RESUME_STRUCTURE_OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.RESUME_STRUCTURE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const maxChars = Number(process.env.RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS ?? "14000") || 14_000;
  const excerpt = input.resumeText.slice(0, Math.min(maxChars, 100_000));

  const userPayload: Record<string, unknown> = {
    resume_text: excerpt,
  };
  if (input.draftProfile !== undefined) {
    userPayload.draft_profile = input.draftProfile;
  }
  if (input.draftWarnings?.length) {
    userPayload.draft_warnings = input.draftWarnings.slice(0, 20);
  }
  const user = JSON.stringify(userPayload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
  const started = Date.now();
  try {
    log("info", "strict_llm_resume_parse_request_start", {
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
          { role: "system", content: STRICT_LLM_RESUME_PARSE_SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("warn", "strict_llm_resume_parse_http_error", {
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
      log("warn", "strict_llm_resume_parse_empty_content", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return { ok: false, reason: "empty" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(rawContent));
    } catch {
      log("warn", "strict_llm_resume_parse_json_error", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return { ok: false, reason: "json" };
    }

    const validated = parseStrictLlmResumeJson(parsed);
    if (!validated.ok) {
      log("warn", "strict_llm_resume_parse_zod_reject", {
        ...ctx,
        duration_ms: Date.now() - started,
        issues: validated.error.issues.slice(0, 8),
      });
      return { ok: false, reason: "zod" };
    }

    log("info", "strict_llm_resume_parse_ok", {
      ...ctx,
      model,
      duration_ms: Date.now() - started,
      skills: validated.data.skills.length,
      experience: validated.data.experience.length,
    });
    return { ok: true, data: validated.data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    log("warn", "strict_llm_resume_parse_failed", {
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
