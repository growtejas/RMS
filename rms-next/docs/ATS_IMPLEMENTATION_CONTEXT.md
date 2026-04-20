# ATS Implementation Context (Phases 1–6)

This file captures the implementation context of the ATS build so far, with extra focus on:
- workflow behavior (state transitions, ownership, processing flow),
- ranking logic (signals, formulas, weights, recompute/snapshot behavior).

Product-level rule-based ranking spec: [`../../docs/ATS`](../../docs/ATS) (skills / experience / notice / bonus, versioning, persistence).

It is intended as a quick handover reference for future implementation and debugging.

---

## 1) Phase Progress Snapshot

- Phase 1 (foundation + ingestion model): **partial**
  - Core stack (Next.js + Drizzle + PostgreSQL) is active.
  - Ingestion ledger table exists (`inbound_events`), but full original phase scope is still broader.
- Phase 2 (queue/workers): **partial**
  - BullMQ/Redis worker flow exists for inbound event processing.
  - Pipeline jobs are chained in worker/service logic.
- Phase 3 (normalization + dedupe): **implemented**
  - Strict email dedupe + soft matching (phone/name/company).
  - Dedupe review payload persistence and review endpoint.
- Phase 4 (ATS core model + compatibility): **implemented**
  - `applications` + `application_stage_history` introduced.
  - Candidate APIs and UI adapted to application-first model with compatibility layer.
  - TA pipeline board reads from application APIs.
- Phase 5 (ranking engine): **implemented**
  - Explainable ranking with keyword + semantic + business scoring.
  - Snapshot persistence and explicit recompute API.
  - Embedding cache tables and local-hash embedding service integrated.
- Phase 6 (ATS V1 + versioning, `0009_ats_v1_ranking`): **implemented**
  - Rule-based ATS V1 layer (docs/ATS §3–4) blended with Phase 5 by default (`RANKING_ENGINE=hybrid`, `RANKING_ATS_V1_WEIGHT`).
  - `skill_aliases`, `ranking_versions`, `candidate_job_scores`; candidate fields `total_experience_years`, `notice_period_days`, `is_referral`, `candidate_skills`; item `ranking_required_skills`.
  - Snapshot `meta` stores `ranking_engine`, `ats_v1_weight`, `ranking_version_id` for cache invalidation.
  - Tie-break: equal `final_score` → earlier `applications.created_at`, then name.

---

## 2) Core Data Model Added During ATS Phases

## Phase 3
- `candidates.current_company`
- `inbound_events.dedupe_review`

## Phase 4
- `applications`
  - One application per candidate per item path (enforced in current logic).
- `application_stage_history`
  - Immutable stage movement history.

## Phase 5
- `ranking_snapshots`
  - Stores full computed ranking payload, version, weights, timestamps.
- `candidate_embeddings`
  - Embedding cache per candidate, source hash, vector payload.
- `requisition_item_embeddings`
  - Embedding cache per requisition item/JD context.

## Phase 6 (docs/ATS alignment)
- `skill_aliases` — alias → canonical skill for V1 skill matching.
- `ranking_versions` — per `requisition_item_id`, monotonic `version_number`, `config` JSON, `is_active` (inactive after new recompute).
- `candidate_job_scores` — `(candidate_id, ranking_version_id)` unique; `score`, `breakdown` JSON; index `(requisition_item_id, score DESC)`.
- `candidates`: `total_experience_years`, `notice_period_days`, `is_referral`, `candidate_skills` (JSON array).
- `requisition_items`: `ranking_required_skills` (JSON array); when empty, V1 required skills fall back to Primary/Secondary lines in `requirements`.

---

## 3) Workflow Context (Most Important Runtime Paths)

## A. Inbound processing workflow (queue-driven)

Main flow in worker/service:
1. inbound event accepted and enqueued
2. normalization
3. resume parse attempt
4. deduplication
   - strict email match first
   - then soft candidate match heuristics
5. persistence
   - candidate create/update
   - application ensure/sync
   - history ensure

Failure behavior:
- event retries according to retry policy,
- terminal failures recorded in `inbound_events.last_error`,
- dedupe edge cases surfaced through `dedupe_review`.

## B. Candidate/Application workflow (manual TA UI/API)

Current effective flow:
1. TA uploads resume (`/api/uploads/resume`)
2. TA creates candidate (`/api/candidates`)
3. service ensures application record exists (`ensureApplicationForCandidateTx`)
4. stage updates go via compatibility path:
   - preferred: `/api/applications/{id}/stage`
   - fallback: `/api/candidates/{id}/stage`
5. every stage change appends to `application_stage_history`

## C. Requisition item workflow coupling

Item lifecycle controls are still enforced (pending/sourcing/shortlisted/interviewing/offered/fulfilled/cancelled).
Candidate stage movement and application stage behavior are kept compatible with item workflow state and ownership checks.

---

## 4) Ranking Logic (Formula + Signals)

Ranking endpoint:
- `GET /api/ranking/requisition-items/{itemId}`: read latest valid snapshot or recompute.
- `POST /api/ranking/requisition-items/{itemId}`: force recompute and persist snapshot.

Current ranking payload version label:
- `phase6-v1-hybrid` (see `RANKING_VERSION` in `src/lib/services/ranking-service.ts`).

## A. Signals

Per candidate, system computes:
- `keyword_score` (0-100)
- `semantic_score` (0-100)
- `business_score` (0-100)
- `ats_v1_score` (0-100) — rule-based composite from docs/ATS (skills, experience, notice, referral bonus).
- `final_score` (0-100) — see **Hybrid** below.

### 1) Keyword score

Required terms are extracted from item fields (`role_position`, `skill_level`, `education_requirement`, `requirements`, `job_description`).

Formula:
- if no required terms: `keyword_score = 50`
- else: `keyword_score = clamp((matched_terms / required_terms) * 100)`

### 2) Semantic score

Current semantic score is blended:
- lexical semantic score (trigram + stem coverage),
- vector semantic score (cosine similarity from embedding cache vectors).

Lexical semantic formula:
- `lexical_semantic = clamp((trigram_similarity * 0.65 + stem_coverage * 0.35) * 100)`

Vector semantic formula:
- candidate and item embeddings are generated/reused,
- cosine similarity in `[0,1]`,
- `vector_semantic = clamp(cosine_similarity * 100)`

Final semantic blend:
- `semantic_score = clamp(vector_semantic * 0.8 + lexical_semantic * 0.2)`

### 3) Business score

Business score starts from stage baseline and is adjusted by interview outcomes + profile completeness hints.

Stage baseline:
- Hired: 95
- Offered: 85
- Interviewing: 75
- Shortlisted: 65
- Sourced: 50
- Rejected: 10
- default: 45

Adjustments:
- `+ min(passCount * 8, 16)`
- `- failCount * 12`
- `+ holdCount * 2`
- `+2` if phone exists
- `+4` if resume path exists
- `+3` if current company exists

Then:
- `business_score = clamp(adjusted_score)`

## B. Phase 5 composite (before ATS blend)

Weights are normalized from env (supports decimal or percent input):
- `RANKING_KEYWORD_WEIGHT`
- `RANKING_SEMANTIC_WEIGHT`
- `RANKING_BUSINESS_WEIGHT`

Current defaults:
- keyword: `0.40`
- semantic: `0.25`
- business: `0.35`

Phase 5 composite:
- `phase5_final = clamp(keyword_score * Wk + semantic_score * Ws + business_score * Wb)`

## C. ATS V1 + hybrid final score

- `RANKING_ENGINE`: `hybrid` (default) | `ats_v1` | `phase5_only`
- `RANKING_ATS_V1_WEIGHT` (default `0.35`): used only when `hybrid`.

Formulas:
- `hybrid`: `final_score = clamp((1 - w) * phase5_final + w * ats_v1_score)`
- `ats_v1`: `final_score = ats_v1_score`
- `phase5_only`: `final_score = phase5_final`

V1 skill list: `ranking_required_skills` on item, else parsed from `requirements`; candidate skills = DB `candidate_skills` + resume parse skills.

## D. Explainability payload

Per candidate explain section includes:
- reasons (keyword coverage, semantic fit, vector similarity, ATS V1 summary, hybrid line, stage signal, resume parse status, interview outcomes),
- matched and missing terms,
- optional `ats_v1` object (skills/exp/notice/bonus components, matched/required counts, `partial_data`).

---

## 5) Snapshot + Recompute Behavior

- Ranking results are persisted in `ranking_snapshots.payload` (includes `meta`: engine, V1 weight, `ranking_version_id`).
- Each POST recompute: deactivate prior `ranking_versions` rows for the item, insert new active version, write `candidate_job_scores` rows, then insert snapshot.
- Snapshot reuse rule:
  - same `ranking_version` string on row and payload,
  - same normalized Phase 5 weights (within epsilon),
  - same `meta.ranking_engine` and `meta.ats_v1_weight` as current env.
- If matched snapshot exists, GET serves cached payload.
- If not, GET recomputes and writes a new snapshot.
- POST always recomputes and writes snapshot.

This gives:
- deterministic replay for UI reads,
- quick reloads,
- versioned evolution of ranking logic,
- auditable per-version scores in `candidate_job_scores`.

---

## 6) UI Visibility Mapping (Current)

`TA Requisition Detail` candidates tab now shows:
- application pipeline board (Phase 4),
- ranking panel (Phase 5–6) with:
  - ranking version,
  - weights,
  - engine + ATS V1 weight (`meta`),
  - generated timestamp,
  - per-candidate score breakdown (K/S/B/V1/final),
  - ATS V1 line (matched skills, partial data),
  - reasons preview,
  - optional ranking required skills editor (saved with pipeline ranking JD PATCH),
  - add-candidate fields for ATS (experience, notice, referral, skills),
  - refresh + recompute actions.

---

## 7) Operational Notes

- If candidate creation fails with `candidate_embeddings` query errors, embedding migrations are not applied to the active DB.
- Required ranking-related migrations (apply in order):
  - `0005_phase5_ranking_snapshots.sql`
  - `0006_phase5_ranking_semantic_weight.sql`
  - `0007_phase5_embeddings_cache.sql`
  - `0008_pipeline_ranking_jd.sql`
  - `0009_ats_v1_ranking.sql`

---

## 8) Suggested Next Steps (From Current State)

1. replace local-hash embeddings with provider-backed embeddings (OpenAI/other) behind env flags,
2. add ranking snapshot history endpoint and UI history panel,
3. add event-driven recompute triggers (candidate/stage/interview/JD changes),
4. add evaluation dataset + ranking quality reporting,
5. optional LLM rerank over top-N only (keep deterministic core as baseline).

