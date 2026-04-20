# AI evaluation layer (optional)

Structured LLM scoring that **augments** the existing deterministic rank score (Phase 5 + ATS V1 + skill gate). It does **not** replace keyword, semantic, business, or ATS V1 logic.

## Behavior summary

| Surface | LLM called? | Notes |
|--------|-------------|--------|
| `GET /api/ranking/requisition-items/[itemId]` | No | Deterministic ranking only (snapshot or recompute). |
| `GET /api/ranking/requisition-items/[itemId]?ai_eval=1` | No | Merges **cached** rows from `candidate_ai_evaluations` when the **input hash** for the current normalized job + candidate + model + prompt version matches. Re-sorts by blended `final_score`. |
| `POST /api/ranking/requisition-items/[itemId]/ai-evaluation` | Yes (if enabled) | Runs evaluation for `candidate_ids` or top **`top_n`** by **current deterministic order** from `rankCandidatesForRequisitionItem`. Respects cache unless **`force: true`**. |

## Scoring and blend

- The LLM returns dimensions (0–100): project complexity, growth trajectory, company reputation, JD alignment, plus `confidence` (0–1), `summary`, and `risks`.
- **Composite `ai_score`:** `0.30·project + 0.25·growth + 0.15·company + 0.30·jd_alignment` (clamped 0–100).
- **Display blend** (after deterministic + skill gate):  
  `displayFinal = (1 - w) * deterministicFinal + w * ai_score`  
  where **`w = 0.30`** if `confidence >= 0.5`, else **`w = 0.10`**. If no cached evaluation applies, **`w = 0`** (scores unchanged).

## Cache key

Rows in **`candidate_ai_evaluations`** are keyed by `(organization_id, requisition_item_id, candidate_id, input_hash)`.  
`input_hash` is **SHA-256** of a canonical JSON payload: normalized **job** + **candidate** objects, plus **`model`** and **`prompt_version`**. If JD, required skills, structured resume, or prompt version change, the hash changes and older rows are not used until you re-run POST (or the new hash is written).

## POST body

```json
{
  "candidate_ids": [1, 2, 3],
  "top_n": 10,
  "force": false,
  "include_eval_input": false
}
```

Provide **`candidate_ids`** (non-empty) **or** **`top_n`**. If both are sent, **`candidate_ids`** wins.  
Set **`include_eval_input`: `true`** to echo the normalized **`job`** + **`candidate`** objects each row uses for the cache hash and for the LLM user payload (same shape as in `build-ai-evaluation-payload.ts`). If **`AI_EVAL_MAX_INPUT_CHARS`** forces truncation, the model may see a shortened serialization of that payload; the echoed objects are the **pre-truncation** normalized inputs.  
Responses include per-candidate **`status`**: `ok`, `skipped_cache`, `disabled`, `llm_failed`, `not_found` (candidate not in current ranking snapshot / wrong org).

When **`status` is `llm_failed`**, check **`llm_failure_reason`** and optional **`llm_http_status`**:

| `llm_failure_reason` | What to do |
|----------------------|------------|
| `openai_http_401` | Invalid or expired **`AI_EVAL_OPENAI_API_KEY`**. |
| `openai_http_403` | Key lacks permission or org blocks the model. |
| `llm_http_404` | Wrong API URL or **model id** (common with Gemini: old names like `gemini-1.5-flash` 404 on `v1beta`). Set **`AI_EVAL_GEMINI_MODEL`** / **`AI_EVAL_MODEL`** or fix **`AI_EVAL_OPENAI_BASE_URL`**. |
| `llm_quota_exceeded` | **Provider quota / billing** (e.g. OpenAI 429 with *“exceeded your current quota”*, or Gemini `RESOURCE_EXHAUSTED`). Fix billing or API limits for the configured provider; retries will not help. |
| `openai_http_429` | **Rate limit** (too many requests per minute), not necessarily quota. The server may retry with backoff. If the response body indicates quota/billing, you get **`llm_quota_exceeded`** instead. |
| `openai_http_other` | See server logs (`ai_eval_http_error`) for response body excerpt. |
| `openai_schema_rejected` | Model returned JSON that failed validation; retry or change model. |
| `openai_invalid_json` | Model did not return parseable JSON. |
| `openai_empty_content` | Empty model message. |
| `openai_timeout` | Increase **`AI_EVAL_TIMEOUT_MS`** or simplify payload. |
| `openai_network_error` | Connectivity / TLS / proxy. |
| `no_api_key` | No API key for the active provider: set **`AI_EVAL_GEMINI_API_KEY`** (Gemini) and/or **`AI_EVAL_OPENAI_API_KEY`** (OpenAI), and **`AI_EVAL_LLM_PROVIDER`** if both are set (restart after changing env). |
| `disabled` | **`AI_EVAL_ENABLED`** not true. |

## Auth and CSRF (POST)

`POST .../ai-evaluation` is a mutating `/api/*` call. The app’s middleware enforces CSRF **unless** the request sends a JWT in **`Authorization`**: use `Authorization: Bearer <access_token>` or paste the raw JWT (three segments) as the header value. If you rely on **`rfm_access` cookie only** (no `Authorization` header), you must also send **`x-csrf-token`** equal to the **`rfm_csrf`** cookie (the browser client does this automatically). This is **not** related to **`AI_EVAL_OPENAI_API_KEY`** / **`AI_EVAL_GEMINI_API_KEY`** (those are server-side only for the LLM call).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `AI_EVAL_ENABLED` | `true` / `1` / `yes` to allow POST evaluations |
| `AI_EVAL_LLM_PROVIDER` | `openai` (default) or `gemini`. If omitted and only **`AI_EVAL_GEMINI_API_KEY`** is set, Gemini is used. |
| `AI_EVAL_OPENAI_API_KEY` | Bearer token for OpenAI-compatible API |
| `AI_EVAL_OPENAI_BASE_URL` | Default `https://api.openai.com/v1` |
| `AI_EVAL_MODEL` | OpenAI model id; default `gpt-4o-mini` |
| `AI_EVAL_GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) key for `generativelanguage.googleapis.com` |
| `AI_EVAL_GEMINI_MODEL` | Default `gemini-2.5-flash` (bare `gemini-1.5-flash` often returns **HTTP 404** on `v1beta`; set an id your key supports, e.g. `gemini-2.0-flash`, or list models [in the API](https://ai.google.dev/api/rest/v1beta/models/list)) |
| `AI_EVAL_GEMINI_BASE_URL` | Optional override; default `https://generativelanguage.googleapis.com/v1beta` |
| `AI_EVAL_TIMEOUT_MS` | Default `45000` (min 5000, max 120000) |
| `AI_EVAL_MAX_INPUT_CHARS` | Cap on serialized user JSON (default `16000`) |
| `AI_EVAL_PROMPT_VERSION` | Logical prompt version (default `ai-eval-v1`); bump to invalidate cache hashes |
| `AI_EVAL_MIN_INTERVAL_MS` | Delay between each candidate’s LLM call (default `1500`); raises total time but cuts **429** bursts on either provider |
| `AI_EVAL_429_MAX_RETRIES` | Extra attempts after **429** per candidate (default `3`; honors **`Retry-After`** when sent) |
| `AI_EVAL_429_FAIL_FAST` | If `true`, no 429 backoff—immediate **`llm_failed`** (stops Postman/UI from waiting many minutes) |
| `AI_EVAL_429_BACKOFF_CAP_MS` | Max wait from **`Retry-After`** / backoff (default `90000`) |

## Security and data handling

- All queries are scoped by **`organization_id`** (tenant).
- The model receives **normalized** job and candidate JSON only (truncated lists/strings); no raw resume file/blob in the prompt. Emails/phones are not sent as dedicated fields (profile is skill/employment-focused).
- **Company reputation** is prompt-constrained to treat unknown employers as neutral; outputs are **judgment, not ground truth**—use `confidence` and `risks` for review.

## Failure modes

- Disabled or missing API key: POST returns **`disabled`** per candidate; GET enrich simply skips blend when no cache row matches.
- Invalid JSON or Zod validation failure after LLM: row is not written; POST reports **`llm_failed`** for that candidate.
- Network errors: retries on transport / 5xx; **429** uses **`Retry-After`** (when present) plus exponential backoff up to **`AI_EVAL_429_MAX_RETRIES`**. No retry on schema validation failure.

## Code map

- Schemas / blend helpers: `src/lib/services/ai-evaluation/ai-evaluation.schema.ts`
- Payload + hash: `src/lib/services/ai-evaluation/build-ai-evaluation-payload.ts`
- LLM: `src/lib/services/ai-evaluation/ai-evaluation-llm.ts`
- Enrich + POST orchestration: `src/lib/services/ai-evaluation/ai-evaluation-service.ts`
- Repository: `src/lib/repositories/candidate-ai-evaluations-repo.ts`
- Migration: `drizzle/0015_candidate_ai_evaluations.sql`

## Related

- ATS overview: [`docs/ATS_SYSTEM_OVERVIEW.md`](ATS_SYSTEM_OVERVIEW.md)
