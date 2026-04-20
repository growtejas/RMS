# Phase 1: Candidate ingestion — decision and verification (RMS)

This document **implements** the Phase 1 verification plan: an explicit **product/schema choice** and **test definitions** that match the codebase. It does **not** change the plan file in `.cursor/plans/`.

## Decision (required for Phase 1 scope)

**Adopted path: per-line candidate model (matches current RMS).**

- **Rationale:** The database already enforces `candidates` scoped to `requisition_item_id` and `UNIQUE(applications.candidate_id)`. “Global pool + multiple independent applications per person” requires a **separate migration project** (new or split tables, data backfill, API/ingest rewrites). That is **out of scope** for this Phase 1 closure.
- **Implication:** Phase 1 “ingestion” means **correct create + ensure application on one line**, with **email dedupe on that line**, not org-wide identity reuse.

If you later choose the global path, use the **Deferred: global pool** section below as the starting design checklist.

---

## APIs (already implemented)

| API | Location | Notes |
|-----|----------|--------|
| `POST /api/candidates` | [`src/app/api/candidates/route.ts`](../src/app/api/candidates/route.ts) | Body requires `requisition_item_id`, `requisition_id` ([`candidateCreateBody`](../src/lib/validators/candidates.ts)). |
| `POST /api/applications` | [`src/app/api/applications/route.ts`](../src/app/api/applications/route.ts) | [`ensureApplicationFromCandidateJson`](../src/lib/services/applications-service.ts); idempotent **201/200**. |

Core logic: [`createCandidateJson`](../src/lib/services/candidates-service.ts), [`ensureApplicationForCandidateTx`](../src/lib/services/application-sync-service.ts).

---

## Duplicate handling (as implemented)

- **Email / person:** [`findOrCreatePersonTx`](../src/lib/repositories/candidate-persons-repo.ts) resolves **`candidate_persons`** by **org + normalized email**; duplicate **same org + same `requisition_item_id` + same person** → **409** on create (via `selectCandidateIdByOrgItemPersonTx`).
- **Resume hash (same line):** optional reject or flag-only dedupe via env (see `CANDIDATE_RESUME_HASH_REJECT_DUPLICATES` in [`.env.example`](../.env.example)).

**Same email, different job lines:** one `candidate_persons` row, two `candidates` rows (and two applications).

---

## Phase 1 test matrix (redefined for adopted path)

| Test | Expected behavior (adopted) | Pass criteria |
|------|----------------------------|-----------------|
| Same email, **same** requisition line | No second `candidates` row | `POST /api/candidates` returns **409** with clear `detail`. |
| Same email, **different** requisition line | Allowed | Two `candidates` rows sharing **`person_id`**; two applications — **by design** ([PHASE_FUTURE_GLOBAL_POOL.md](./PHASE_FUTURE_GLOBAL_POOL.md)). |
| Application for a candidate on a line | One application row per `candidate_id` | `POST /api/applications` returns existing application if present; creates row if missing. |
| “Same candidate, multiple requisitions” | **Not** multiple `applications` per one `candidate_id` | Moving line would **update** the single application row via sync if business logic ever re-pointed the same `candidate_id` (today candidate row is tied to one line at create). |

**Automated coverage (validators + schema contracts):** [`tests/unit/phase0-phase1-contracts.test.ts`](../tests/unit/phase0-phase1-contracts.test.ts). Full **409 duplicate-email** and **201/200** application flows still require integration tests against a database + auth.

---

## Deferred: global pool + multi-application (not chosen now)

When the org chooses the pipeline-doc model (“global person, many applications”):

1. **New table** (e.g. `candidate_profiles` / `people`): org-scoped unique email (or merge rules); resume, PII; **no** `requisition_item_id`.
2. **`candidates` role:** either removed or becomes a thin link `person_id` + optional legacy FK during migration.
3. **`applications`:** `UNIQUE(candidate_id)` must become **`UNIQUE(person_id, requisition_item_id)`** (or equivalent); drop one-row-per-old-candidate assumption.
4. **Migrations:** backfill person from existing `candidates`, split rows, fix FKs from ranking/scores/interviews to application or person as designed.
5. **APIs:** `POST /api/candidates` creates/updates **person**; `POST /api/applications` creates **application** `(person, item)` without requiring a new person row per line.

Until then, treat [Candidate_Pipeline.txt](./Candidate_Pipeline.txt) “global database” as **target architecture**, not current DB shape.

---

## Implementation status (repo)

- Per-line ingestion APIs: `POST /api/candidates`, `POST /api/applications` (see table above).
- Contract tests: [`tests/unit/phase0-phase1-contracts.test.ts`](../tests/unit/phase0-phase1-contracts.test.ts).

## Related docs

- [PHASE_0_DATABASE_CHECKLIST.md](./PHASE_0_DATABASE_CHECKLIST.md)
- [Candidate_Pipeline.txt](./Candidate_Pipeline.txt)
