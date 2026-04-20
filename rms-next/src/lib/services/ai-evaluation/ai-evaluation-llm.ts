import { log } from "@/lib/logging/logger";

import {
  aiEvaluationOutputSchema,
  computeAiCompositeScore,
  type AiEvaluationOutput,
  type CandidateEvaluationInput,
  type JobEvaluationInput,
} from "@/lib/services/ai-evaluation/ai-evaluation.schema";

// AI evaluation supports Gemini or an OpenAI-compatible provider (e.g., Groq).
export type AiEvalLlmProvider = "gemini" | "groq";

export type AiEvalLlmFailureReason =
  | "disabled"
  | "no_api_key"
  | "llm_http_401"
  | "llm_http_403"
  | "llm_http_404"
  | "llm_http_429"
  | "llm_quota_exceeded"
  | "llm_http_other"
  | "llm_empty_content"
  | "llm_invalid_json"
  | "llm_schema_rejected"
  | "llm_timeout"
  | "llm_network_error";

export type AiEvalLlmResult =
  | { ok: true; output: AiEvaluationOutput; aiScore: number }
  | {
      ok: false;
      reason: AiEvalLlmFailureReason;
      http_status?: number;
    };

export function resolveAiEvalEnabled(): boolean {
  const v = process.env.AI_EVAL_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Active LLM backend for AI evaluation. */
export function resolveAiEvalLlmProvider(): AiEvalLlmProvider {
  const explicit = process.env.AI_EVAL_LLM_PROVIDER?.trim().toLowerCase();
  if (explicit === "groq") return "groq";
  return "gemini";
}

export function resolveAiEvalGroqModel(): string {
  return process.env.AI_EVAL_GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
}

/** Strip `models/` if the id was copied from ListModels / docs. */
export function normalizeGeminiModelId(raw: string): string {
  let m = raw.trim();
  if (m.toLowerCase().startsWith("models/")) {
    m = m.slice("models/".length);
  }
  return m;
}

export function resolveAiEvalGeminiModel(): string {
  const fromEnv = process.env.AI_EVAL_GEMINI_MODEL?.trim();
  if (fromEnv) return normalizeGeminiModelId(fromEnv);
  // Bare `gemini-1.5-flash` often 404s on v1beta; use a current Flash id (override via env if your key/region differs).
  return "gemini-2.5-flash";
}

/** Model id stored in cache + input hash (provider-specific). */
export function resolveAiEvalActiveModel(): string {
  return resolveAiEvalLlmProvider() === "groq"
    ? resolveAiEvalGroqModel()
    : resolveAiEvalGeminiModel();
}

/** @deprecated Prefer resolveAiEvalActiveModel */
export function resolveAiEvalModel(): string {
  return resolveAiEvalActiveModel();
}

export function resolveAiEvalPromptVersion(): string {
  return process.env.AI_EVAL_PROMPT_VERSION?.trim() || "ai-eval-v1";
}

export function resolveAiEvalTimeoutMs(): number {
  const n = Number(process.env.AI_EVAL_TIMEOUT_MS ?? "45000");
  return Number.isFinite(n) && n >= 5000 ? Math.min(n, 120_000) : 45_000;
}

export function resolveAiEvalMaxUserChars(): number {
  const n = Number(process.env.AI_EVAL_MAX_INPUT_CHARS ?? "16000");
  return Number.isFinite(n) && n >= 2000 ? Math.min(n, 80_000) : 16_000;
}

/** Pause between each LLM call when evaluating multiple candidates (reduces 429 bursts). */
export function resolveAiEvalMinIntervalMs(): number {
  const n = Number(process.env.AI_EVAL_MIN_INTERVAL_MS ?? "1500");
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 120_000) : 1500;
}

function resolveAiEval429MaxRetries(): number {
  const n = Number(process.env.AI_EVAL_429_MAX_RETRIES ?? "3");
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 20) : 3;
}

function resolveAiEval429FailFast(): boolean {
  const v = process.env.AI_EVAL_429_FAIL_FAST?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function resolveAiEval429BackoffCapMs(): number {
  const n = Number(process.env.AI_EVAL_429_BACKOFF_CAP_MS ?? "90000");
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 300_000) : 90_000;
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after")?.trim();
  if (!raw) return null;
  const sec = Number.parseInt(raw, 10);
  if (Number.isFinite(sec) && sec >= 0) {
    return Math.min(resolveAiEval429BackoffCapMs(), Math.max(1_000, sec * 1000));
  }
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    const ms = when - Date.now();
    return Math.min(resolveAiEval429BackoffCapMs(), Math.max(1_000, ms));
  }
  return null;
}

/** Gateway / capacity — retry with same policy as 429 (exponential backoff, shared caps). */
function isTransientOverloadHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function looksLikeGeminiUnavailableBody(errorJson: string): boolean {
  return /"status"\s*:\s*"UNAVAILABLE"/i.test(errorJson);
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clipEvaluationPayload(
  job: JobEvaluationInput,
  candidate: CandidateEvaluationInput,
  maxLen: number,
): string {
  let jobCl: JobEvaluationInput = { ...job };
  let candCl: CandidateEvaluationInput = { ...candidate };
  for (let i = 0; i < 100; i++) {
    const s = JSON.stringify({ job: jobCl, candidate: candCl });
    if (s.length <= maxLen) return s;
    if (jobCl.description_summary.length > 400) {
      jobCl = {
        ...jobCl,
        description_summary: jobCl.description_summary.slice(
          0,
          Math.max(400, Math.floor(jobCl.description_summary.length * 0.75)),
        ),
      };
      continue;
    }
    if (candCl.projects.length > 2) {
      candCl = {
        ...candCl,
        projects: candCl.projects.slice(0, Math.max(2, candCl.projects.length - 4)),
      };
      continue;
    }
    if (candCl.experience_details.length > 2) {
      candCl = {
        ...candCl,
        experience_details: candCl.experience_details.slice(
          0,
          Math.max(2, candCl.experience_details.length - 4),
        ),
      };
      continue;
    }
    if (candCl.skills.length > 12) {
      candCl = {
        ...candCl,
        skills: candCl.skills.slice(0, Math.max(12, candCl.skills.length - 8)),
      };
      continue;
    }
    if (candCl.companies.length > 2) {
      candCl = {
        ...candCl,
        companies: candCl.companies.slice(0, Math.max(2, candCl.companies.length - 3)),
      };
      continue;
    }
    return s;
  }
  return JSON.stringify({ job: jobCl, candidate: candCl });
}

function httpFailureReason(status: number): AiEvalLlmFailureReason {
  if (status === 401) return "llm_http_401";
  if (status === 403) return "llm_http_403";
  if (status === 404) return "llm_http_404";
  if (status === 429) return "llm_http_429";
  return "llm_http_other";
}

function isProviderQuotaExceededResponse(errorBody: string): boolean {
  const t = errorBody.toLowerCase();
  if (
    t.includes("insufficient_quota") ||
    t.includes("exceeded your current quota") ||
    t.includes("billing_hard_limit") ||
    t.includes("check your plan and billing") ||
    t.includes("resource_exhausted") ||
    t.includes("resource exhausted") ||
    (t.includes("quota") && t.includes("exceeded"))
  ) {
    return true;
  }
  try {
    const j = JSON.parse(errorBody) as {
      error?: { code?: string | number; type?: string; message?: string; status?: string };
    };
    const st = String(j.error?.status ?? "").toUpperCase();
    if (st.includes("QUOTA") || st === "RESOURCE_EXHAUSTED") return true;
    const code = String(j.error?.code ?? j.error?.type ?? "").toLowerCase();
    if (code.includes("quota") || code === "insufficient_quota") return true;
    const msg = String(j.error?.message ?? "").toLowerCase();
    if (msg.includes("quota") && (msg.includes("billing") || msg.includes("exceeded"))) return true;
  } catch {
    /* ignore */
  }
  return false;
}

async function postOpenAiChatOnce(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
}): Promise<Response> {
  return fetch(`${params.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
    signal: params.signal,
  });
}

async function postGeminiGenerateContent(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  signal: AbortSignal;
}): Promise<Response> {
  const base = (
    process.env.AI_EVAL_GEMINI_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/$/, "");
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

function geminiTopLevelError(body: unknown): { text: string; httpLike: number } | null {
  const err = (body as { error?: { code?: number; message?: string; status?: string } }).error;
  if (!err?.message) return null;
  let code: number;
  if (typeof err.code === "number" && err.code >= 400) {
    code = err.code;
  } else if (err.status?.toUpperCase() === "UNAVAILABLE") {
    code = 503;
  } else {
    code = 400;
  }
  return { text: JSON.stringify(body), httpLike: code };
}

function isRetryableFetchError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return false;
  return true;
}

/**
 * Structured JSON evaluation via OpenAI Chat Completions or Google Gemini `generateContent`.
 */
export async function runAiEvaluationLlm(input: {
  job: JobEvaluationInput;
  candidate: CandidateEvaluationInput;
  logContext?: Record<string, unknown>;
}): Promise<AiEvalLlmResult> {
  const ctx = input.logContext ?? {};
  if (!resolveAiEvalEnabled()) {
    log("info", "ai_eval_skipped", { ...ctx, reason: "disabled" });
    return { ok: false, reason: "disabled" };
  }

  const provider = resolveAiEvalLlmProvider();
  const apiKey =
    provider === "groq"
      ? process.env.AI_EVAL_GROQ_API_KEY?.trim()
      : process.env.AI_EVAL_GEMINI_API_KEY?.trim();

  if (!apiKey) {
    log("info", "ai_eval_skipped", {
      ...ctx,
      reason: "no_api_key",
      provider,
    });
    return { ok: false, reason: "no_api_key" };
  }

  const model = resolveAiEvalActiveModel();
  const maxChars = resolveAiEvalMaxUserChars();
  const userJson = clipEvaluationPayload(input.job, input.candidate, maxChars);

  const system = `You evaluate a candidate against a job for an ATS. Return ONE JSON object only (no markdown) with exactly these keys:
project_complexity (number 0-100): complexity/depth of projects implied by the candidate profile.
growth_trajectory (number 0-100): career progression signal from roles and scope.
company_reputation (number 0-100): use only well-known public reputation; if employers are unknown, use 50 (neutral).
jd_alignment (number 0-100): fit to required skills, experience, and role summary.
confidence (number 0-1): your confidence in this assessment given data quality.
summary (string): 2-6 sentences, factual, no PII beyond what is given.
risks (string array): short bullets (missing skills, tenure gaps, ambiguity); max 30 items.

Rules: Do not invent employers, degrees, or skills not supported by the input. Prefer neutral scores when data is thin.`;

  const maxRounds = 12;
  let count429 = 0;
  let countOverload = 0;
  let did5xxRetry = false;
  let didNetworkRetry = false;

  for (let round = 0; round < maxRounds; round++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolveAiEvalTimeoutMs());
    const started = Date.now();
    try {
      const res =
        provider === "groq"
          ? await postOpenAiChatOnce({
              baseUrl: (
                process.env.AI_EVAL_GROQ_BASE_URL?.trim() ||
                "https://api.groq.com/openai/v1"
              ).replace(/\/$/, ""),
              apiKey,
              model,
              system,
              user: userJson,
              signal: controller.signal,
            })
          : await postGeminiGenerateContent({
              apiKey,
              model,
              system,
              user: userJson,
              signal: controller.signal,
            });

      const rawBody = await res.text();
      let json: Record<string, unknown>;
      try {
        json = rawBody.trim() ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
      } catch {
        json = {};
      }
      const errTextForQuota =
        Object.keys(json).length > 0 ? JSON.stringify(json) : rawBody.slice(0, 2000);

      if (!res.ok) {
        log("warn", "ai_eval_http_error", {
          ...ctx,
          provider,
          status: res.status,
          duration_ms: Date.now() - started,
          round,
          body_excerpt: errTextForQuota.slice(0, 200),
        });
        clearTimeout(timer);

        if (
          (res.status === 429 || res.status === 400) &&
          isProviderQuotaExceededResponse(errTextForQuota)
        ) {
          log("warn", "ai_eval_quota_exceeded", { ...ctx, provider, round });
          return { ok: false, reason: "llm_quota_exceeded", http_status: 429 };
        }

        if (res.status === 429) {
          if (resolveAiEval429FailFast()) {
            return { ok: false, reason: "llm_http_429", http_status: 429 };
          }
          count429++;
          if (count429 > resolveAiEval429MaxRetries()) {
            return { ok: false, reason: "llm_http_429", http_status: 429 };
          }
          const fromHeader = parseRetryAfterMs(res);
          const exp = Math.min(
            resolveAiEval429BackoffCapMs(),
            2000 * Math.pow(2, count429 - 1),
          );
          const waitMs = fromHeader ?? exp;
          log("warn", "ai_eval_429_backoff", {
            ...ctx,
            wait_ms: waitMs,
            count_429: count429,
            round,
          });
          await sleep(waitMs);
          continue;
        }

        if (isTransientOverloadHttpStatus(res.status)) {
          // Even when fail-fast is enabled for 429s, transient overloads (502/503/504)
          // are worth retrying with backoff to make the UI reliably "eventually consistent".
          countOverload++;
          if (countOverload > resolveAiEval429MaxRetries()) {
            return { ok: false, reason: "llm_http_other", http_status: res.status };
          }
          const fromHeader = parseRetryAfterMs(res);
          const exp = Math.min(
            resolveAiEval429BackoffCapMs(),
            2000 * Math.pow(2, countOverload - 1),
          );
          const waitMs = fromHeader ?? exp;
          log("warn", "ai_eval_transient_overload_backoff", {
            ...ctx,
            provider,
            wait_ms: waitMs,
            count_overload: countOverload,
            http_status: res.status,
            round,
          });
          await sleep(waitMs);
          continue;
        }

        if (res.status >= 500 && !did5xxRetry) {
          did5xxRetry = true;
          await sleep(400);
          continue;
        }

        return {
          ok: false,
          reason: httpFailureReason(res.status),
          http_status: res.status,
        };
      }

      clearTimeout(timer);

      if (provider === "gemini") {
        const gErr = geminiTopLevelError(json);
        if (gErr) {
          log("warn", "ai_eval_http_error", {
            ...ctx,
            provider: "gemini",
            status: gErr.httpLike,
            duration_ms: Date.now() - started,
            round,
            body_excerpt: gErr.text.slice(0, 200),
          });
          if (isProviderQuotaExceededResponse(gErr.text)) {
            return { ok: false, reason: "llm_quota_exceeded", http_status: 429 };
          }
          if (gErr.httpLike === 429) {
            if (resolveAiEval429FailFast()) {
              return { ok: false, reason: "llm_http_429", http_status: 429 };
            }
            count429++;
            if (count429 > resolveAiEval429MaxRetries()) {
              return { ok: false, reason: "llm_http_429", http_status: 429 };
            }
            await sleep(Math.min(resolveAiEval429BackoffCapMs(), 2000 * Math.pow(2, count429 - 1)));
            continue;
          }
          if (
            isTransientOverloadHttpStatus(gErr.httpLike) ||
            looksLikeGeminiUnavailableBody(gErr.text)
          ) {
            // Same as the REST layer: retry transient overload even when 429 is fail-fast.
            countOverload++;
            if (countOverload > resolveAiEval429MaxRetries()) {
              return { ok: false, reason: "llm_http_other", http_status: gErr.httpLike };
            }
            await sleep(
              Math.min(resolveAiEval429BackoffCapMs(), 2000 * Math.pow(2, countOverload - 1)),
            );
            continue;
          }
          return {
            ok: false,
            reason: httpFailureReason(gErr.httpLike),
            http_status: gErr.httpLike,
          };
        }
      }

      const rawContent =
        provider === "gemini" ? extractGeminiCandidateText(json) : extractOpenAiChatText(json);

      if (!rawContent?.trim()) {
        log("warn", "ai_eval_empty_content", {
          ...ctx,
          provider,
          duration_ms: Date.now() - started,
        });
        return { ok: false, reason: "llm_empty_content" };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripJsonFence(rawContent));
      } catch {
        log("warn", "ai_eval_json_parse_error", {
          ...ctx,
          provider,
          duration_ms: Date.now() - started,
        });
        return { ok: false, reason: "llm_invalid_json" };
      }
      const validated = aiEvaluationOutputSchema.safeParse(parsed);
      if (!validated.success) {
        log("warn", "ai_eval_zod_reject", {
          ...ctx,
          provider,
          duration_ms: Date.now() - started,
          issues: validated.error.issues.slice(0, 8),
        });
        return { ok: false, reason: "llm_schema_rejected" };
      }
      const output = validated.data;
      const aiScore = computeAiCompositeScore(output);
      return { ok: true, output, aiScore };
    } catch (e) {
      clearTimeout(timer);
      const isAbort = e instanceof Error && e.name === "AbortError";
      log("warn", "ai_eval_fetch_error", {
        ...ctx,
        provider,
        duration_ms: Date.now() - started,
        round,
        err: e instanceof Error ? e.message : String(e),
        abort: isAbort,
      });
      if (isAbort) {
        return { ok: false, reason: "llm_timeout" };
      }
      if (!didNetworkRetry && isRetryableFetchError(e)) {
        didNetworkRetry = true;
        await sleep(400);
        continue;
      }
      return { ok: false, reason: "llm_network_error" };
    }
  }

  return {
    ok: false,
    reason:
      count429 > 0
        ? "llm_http_429"
        : countOverload > 0
          ? "llm_http_other"
          : "llm_network_error",
    http_status: count429 > 0 ? 429 : undefined,
  };
}
