-- CIE: store rich `StrictResumeV2` document alongside the flat `ParsedCandidate`.
-- Additive only. Existing `parsed_json` (flat ParsedCandidate) stays the source of truth for
-- legacy consumers; CIE LLM prefers `parsed_v2_json` when present.

ALTER TABLE "candidate_parsed_data"
  ADD COLUMN IF NOT EXISTS "parsed_v2_json" jsonb;
