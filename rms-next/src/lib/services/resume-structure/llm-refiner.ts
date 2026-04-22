import { log } from "@/lib/logging/logger";
import {
  coerceExternalLlmResumeProfile,
  extractNumericFieldConfidenceFromLlmJson,
  stripNonProfileKeysForZod,
  type FieldConfidenceOverride,
} from "@/lib/services/resume-structure/llm-profile-coercion";
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
}): Promise<{
  profile: ParsedCandidateProfile;
  warnings: string[];
  fieldConfidenceOverride?: FieldConfidenceOverride;
} | null> {
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

  const system = `You are a strict, production-grade resume parsing engine for an Applicant Tracking System (ATS).
Your goal is accurate, structured, SCORABLE data. Return ONLY valid JSON. No explanations, markdown, or comments.

TOP-LEVEL KEYS (exactly these; no extras): full_name, emails, phones, total_experience_years, skills, education, confidence.

-----------------------------------
1. SKILLS (HIGH PRIORITY)
-----------------------------------
- Extract ONLY technical skills: programming languages, frameworks, libraries, databases, tools.
- INCLUDE skills from: SKILLS section, PROJECTS section (very important), EXPERIENCE section (tools used on the job).
- Extract tools mentioned inside project and experience descriptions (e.g. "Built using Selenium and BeautifulSoup" → include both; ML stacks: XGBoost, TensorFlow, YOLO, OpenCV, etc.).
- DO NOT include: section headings ("Languages –", "Data Analysis –"), soft skills (communication, leadership), certification names as line items, achievements, sentences or long descriptions.
- Split grouped skills, e.g. "Python (Pandas, NumPy, Scikit-learn)" → separate strings: Python, Pandas, NumPy, Scikit-learn.
- Normalize: scikit learn / scikit-learn → Scikit-learn; power bi → Power BI; node → Node.js; reactjs → React.
- Deduplicate (case-insensitive).

-----------------------------------
2. EXPERIENCE (CRITICAL)
-----------------------------------
- If full-time professional experience exists: total_experience_years = computed total years (number; can be decimal).
- If ONLY internships / student projects: use 0, 0.5, or 1 based on duration and evidence.
- If any timeline or work evidence exists, do NOT use null for total_experience_years — use 0 only when truly no professional evidence and minimal intern/student evidence.
- Estimate from dates when clearly inferable.

-----------------------------------
3. EMAIL AND PHONE
-----------------------------------
- emails: only syntactically valid addresses.
- phones: real numbers only; never employment date ranges or bare years. Output each phone as digits-only (strip spaces, dashes, parentheses, plus signs) in the phones array.

-----------------------------------
4. EDUCATION
-----------------------------------
- education: string array of clean degree lines only (e.g. "BTech in Civil Engineering"). No broken fragments or raw noise.

-----------------------------------
5. IGNORE COMPLETELY
-----------------------------------
Soft skills sections, certifications sections, achievements, generic paragraph summaries (do not copy into skills or education).

-----------------------------------
6. confidence (required)
-----------------------------------
Numeric 0–1 only for: "skills" and "experience" (no other keys).

OUTPUT SHAPE:
{
  "full_name": string | null,
  "emails": string[],
  "phones": string[],
  "total_experience_years": number,
  "skills": string[],
  "education": string[],
  "confidence": { "skills": number, "experience": number }
}

INTEGRATION: The user message has resume_excerpt (source of truth), plus draft_profile and draft_warnings from rules. Prefer resume_excerpt; use drafts only to disambiguate. Do not invent employers or degrees.`;

  const user = JSON.stringify({
    draft_warnings: input.draftWarnings.slice(0, 20),
    draft_profile: input.draftProfile,
    resume_excerpt: excerpt,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeoutMs());
  const started = Date.now();
  try {
    log("info", "resume_structure_llm_request_start", {
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
    const fieldConfidenceOverride =
      extractNumericFieldConfidenceFromLlmJson(parsed);

    let validated = parsedCandidateProfileZ.safeParse(
      typeof parsed === "object" && parsed !== null
        ? stripNonProfileKeysForZod(parsed as Record<string, unknown>)
        : parsed,
    );
    if (!validated.success) {
      const coerced = coerceExternalLlmResumeProfile(parsed);
      validated = parsedCandidateProfileZ.safeParse(coerced);
    }
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
      llm_field_confidence_keys: fieldConfidenceOverride
        ? Object.keys(fieldConfidenceOverride)
        : [],
    });
    return {
      profile: validated.data,
      warnings: [...input.draftWarnings, "LLM_REFINED"],
      ...(fieldConfidenceOverride && Object.keys(fieldConfidenceOverride).length > 0
        ? { fieldConfidenceOverride }
        : {}),
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
