# Ingest paths vs application sync and ranking (Candidate Pipeline §11)

This matrix records **what happens today** when candidates enter RMS. It links product intent (continuous flow: ingest → application → ranking → buckets) to code.

| Path | Entry API / worker | `applications` row | Resume / structure | Ranking / `ats_bucket` |
|------|-------------------|--------------------|--------------------|-------------------------|
| Manual TA / HR create | `POST /api/candidates` | **`findOrCreatePersonTx`** (org + normalized email) then candidate insert + **`ensureApplicationForCandidateTx`** | Embedding + optional resume-structure queue | **Not auto-recomputed** on create; TA uses **Recompute** on the requisition ranking panel or scheduled jobs if configured |
| Ensure / backfill | `POST /api/applications` | **Idempotent**: returns existing row when `candidate_id` already has an application (see §18 in [Candidate_Pipeline.txt](./Candidate_Pipeline.txt)) | N/A | Same as above |
| Public / async ingest | `POST /api/public/apply/[slug]` → inbound event → persist worker | **`findOrCreatePersonTx`** then candidate upsert + **`ensureApplicationForCandidateTx`** on persist ([`inbound-events-processing-service.ts`](../src/lib/services/inbound-events-processing-service.ts)) | Parse cache, optional structure refine job | Ranking still **eventual** unless a worker or UI triggers recompute |
| Bulk import | `bulk_import_jobs` + [`process-bulk-import-worker.ts`](../src/lib/queue/workers/process-bulk-import-worker.ts) | **Stub** (worker marks job complete without row iteration) | N/A | Wire when CSV path is implemented: should call same candidate + `ensureApplication` + embedding pattern as manual create |

## Gaps / follow-ups

1. **Automatic ranking recompute** after each ingest is not uniformly wired; align with §11 by enqueueing a requisition-item recompute (or debounced batch) from persist paths when safe.
2. **Bulk import** must create candidates and call **`ensureApplicationForCandidateTx`** per row before marking jobs complete.
3. **Monitoring**: log `application_id` after inbound persist to verify every candidate has an application before ranking jobs run.

See also: [PHASE_1_INGESTION_DECISION.md](./PHASE_1_INGESTION_DECISION.md), [Candidate_Pipeline.txt](./Candidate_Pipeline.txt) §17 (ATS list).
