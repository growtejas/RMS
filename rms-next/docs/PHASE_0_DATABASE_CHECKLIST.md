# Phase 0 — database checklist (RMS / Drizzle)

This document maps **Phase 0** goals to the **actual** `rms-next` schema so upgrades stay aligned with code.

## Tables

| Goal | RMS reality |
|------|-------------|
| `candidates` | Table exists: [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) (`candidates`). Rows are scoped to `requisition_item_id`, `requisition_id`, and `organization_id` (not a separate “global pool” table yet). |
| `applications` | Table exists: same file (`applications`). One row per `candidate_id` today (`UNIQUE(candidate_id)`). |

## Stage column naming

| Doc / Phase 0 wording | Database column |
|----------------------|-----------------|
| `applications.stage` | **`current_stage`** — `varchar`, default `Sourced`. **Do not add** a duplicate column named `stage`; all services and APIs use `current_stage`. |

JSON/API responses may expose `current_stage`; treat product language “stage” as this column.

## ATS bucket

| Field | Database | Migration |
|-------|----------|-----------|
| ATS bucket on application | **`ats_bucket`** (`varchar(30)`, nullable) on `applications` | Applied by Drizzle SQL [`../drizzle/0016_applications_ats_bucket.sql`](../drizzle/0016_applications_ats_bucket.sql) (journal tag `0016_applications_ats_bucket`). |

## Indexes (applications)

| Phase 0 idea | RMS index |
|--------------|-----------|
| Filter by requisition line + stage | **`idx_applications_item_stage_createdat`** on `(requisition_item_id, current_stage, created_at)` |
| Filter by org + line + bucket (multi-tenant) | **`idx_applications_org_item_ats_bucket`** on `(organization_id, requisition_item_id, ats_bucket)` |

Prefer the org-scoped bucket index for tenant-safe queries; do not omit `organization_id` in application queries.

## Operator: apply migration on each environment

From `rms-next`:

```bash
npm run db:migrate
```

Requires a valid `DATABASE_URL`. Ensures `0016_applications_ats_bucket` (and prior migrations) are applied.

## Schema source of truth

Edit tables in [`src/lib/db/schema.ts`](../src/lib/db/schema.ts), then `npm run db:generate` for new Drizzle SQL (or add hand-written SQL under `drizzle/` and update `drizzle/meta/_journal.json` following repo convention).

## Phase 1 (ingestion)

Explicit scope decision and test matrix: [PHASE_1_INGESTION_DECISION.md](./PHASE_1_INGESTION_DECISION.md).

## Implementation status (repo)

- Schema and migrations: maintained in [`src/lib/db/schema.ts`](../src/lib/db/schema.ts) and `drizzle/`.
- Automated checks: [`tests/unit/phase0-phase1-contracts.test.ts`](../tests/unit/phase0-phase1-contracts.test.ts) (column names + ingestion validators).
- Apply DB changes: `npm run db:migrate` from `rms-next` (requires `DATABASE_URL`).
