# Global candidate pool and multi-application (Candidate Pipeline §2–3, §13)

**Status:** **Phase A implemented** — `candidate_persons` table, `candidates.person_id`, unique `(organization_id, requisition_item_id, person_id)`, and find-or-create person by normalized email on manual create and inbound persist. Legacy rows are backfilled 1:1 via migration `0017_candidate_persons_global_pool.sql`.

Current RMS still uses **one `applications` row per `candidate_id`**; cross-line reuse is via **shared `person_id`** (same email in org → same person, distinct candidate + application rows per job line).

## Goals (retained)

1. **One logical person** per org keyed by normalized email (`candidate_persons`).
2. **Many applications** — same person can apply to multiple requisition lines; each line has its own `candidates` row, `applications` row, `current_stage`, `ats_bucket`, and ranking snapshot.
3. **Dedupe** — new inserts merge on `(organization_id, email_normalized)`; optional resume hash rules unchanged.
4. **Constraints** — `uq_candidates_org_item_person` blocks duplicate applications for the same line and person.

## Follow-ups

- **Email change** on an existing candidate/person (PATCH) does not re-link to another person yet; define product rules before implementing.
- **Backfill merge**: historical rows may still map one person per candidate (1:1); optional job to merge `candidate_persons` where emails match.
- **Bulk import worker**: when implemented, must call `findOrCreatePersonTx` + per-line candidate insert.
- **UI**: candidate modal may surface other lines for the same `person_id` (cross-req) with permissions.

See [PIPELINE_INGEST_RANKING_MATRIX.md](./PIPELINE_INGEST_RANKING_MATRIX.md) and [Candidate_Pipeline.txt](./Candidate_Pipeline.txt) §18.
