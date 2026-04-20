import { log } from "@/lib/logging/logger";
import {
  parsedCandidateProfileZ,
  type ParsedCandidateProfile,
} from "@/lib/services/resume-structure/resume-structure.schema";

function resolveLlmEnabled(): boolean {
  const v = process.env.RESUME_STRUCTURE_LLM_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

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
 * Optional OpenAI-compatible chat completion to refine `ParsedCandidateProfile`.
 * Returns null when disabled, misconfigured, timed out, or validation fails.
 */
export async function tryRefineStructuredProfileWithLlm(input: {
  resumeText: string;
  draftProfile: ParsedCandidateProfile;
  draftWarnings: string[];
  logContext?: Record<string, unknown>;
}): Promise<{ profile: ParsedCandidateProfile; warnings: string[] } | null> {
  const ctx = input.logContext ?? {};
  if (!resolveLlmEnabled()) {
    return null;
  }
  const apiKey = process.env.RESUME_STRUCTURE_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    log("info", "resume_structure_llm_skipped", { ...ctx, reason: "no_api_key" });
    return null;
  }
  
  const baseUrl = (
    process.env.RESUME_STRUCTURE_OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model =
    process.env.RESUME_STRUCTURE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const maxChars = Number(process.env.RESUME_STRUCTURE_LLM_MAX_INPUT_CHARS ?? "14000") || 14_000;
  const excerpt = input.resumeText.slice(0, Math.min(maxChars, 100_000));

  const system = `You extract structured resume data for an ATS. Return ONE JSON object only (no markdown) with exactly these keys:
name, email, phone (each string or null),
skills (string array), projects (string array),
experience_years (number or null), experience_details (string array),
education (string or null), certifications (string array),
job_title (string or null), location (string or null),
employment (array of objects with company, title, from, to, bullets — each scalar string or null, bullets string array).
Rules: Do not fabricate employers or degrees. Prefer null over guessing. Normalize skill names to short tokens (e.g. "react", "typescript").`;

  const user = JSON.stringify({
    draft_warnings: input.draftWarnings.slice(0, 20),
    draft_profile: input.draftProfile,
    resume_excerpt: excerpt,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
  const started = Date.now();
  try {
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
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("warn", "resume_structure_llm_http_error", {
        ...ctx,
        status: res.status,
        duration_ms: Date.now() - started,
        body_excerpt: errText.slice(0, 200),
      });
      return null;
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = body.choices?.[0]?.message?.content;
    if (typeof rawContent !== "string" || !rawContent.trim()) {
      log("warn", "resume_structure_llm_empty_content", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonFence(rawContent));
    } catch {
      log("warn", "resume_structure_llm_json_parse_error", {
        ...ctx,
        duration_ms: Date.now() - started,
      });
      return null;
    }
    const validated = parsedCandidateProfileZ.safeParse(parsed);
    if (!validated.success) {
      log("warn", "resume_structure_llm_zod_reject", {
        ...ctx,
        issues: validated.error.issues.slice(0, 8),
        duration_ms: Date.now() - started,
      });
      return null;
    }
    log("info", "resume_structure_llm_ok", {
      ...ctx,
      model,
      duration_ms: Date.now() - started,
      skills_count: validated.data.skills.length,
    });
    return {
      profile: validated.data,
      warnings: [...input.draftWarnings, "LLM_REFINED"],
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    log("warn", "resume_structure_llm_failed", {
      ...ctx,
      aborted,
      duration_ms: Date.now() - started,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
