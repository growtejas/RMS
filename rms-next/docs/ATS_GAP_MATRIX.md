# ATS Gap Matrix

This matrix maps the target RMS ATS plan to the current implementation status.

Status legend:
- `implemented`: usable in current system.
- `partial`: exists but does not satisfy target scope.
- `missing`: not implemented in current system.

| Plan Area | Status | Current Coverage | Required Implementation |
|---|---|---|---|
| Foundation stack (Next.js + Drizzle + PostgreSQL) | implemented | Existing app uses Next.js App Router, TypeScript, Drizzle ORM, Postgres. | Keep and extend. |
| Multi-tenant organizations | partial | `organizations` + `organization_members`; `organization_id` on requisitions, candidates, applications, inbound events; JWT `org_id`; `ApiUser.organizationId`; scoped requisition/candidate/application queries; workflow routes call `requireItemInOrganization`. | Extend org scope to remaining modules (dashboards, audit exports, ranking internals); optional Postgres RLS; org picker for multi-membership users. |
| Auth.js v5 auth stack | partial | Custom JWT with `org_id` claim; `src/lib/auth/authjs-bridge.ts` documents dual-read cutover. | Mount Auth.js v5, validate session alongside JWT in `requireBearerUser`, migrate clients. |
| Role/permission model with scoped assignments | partial | `roles`, `user_roles`, org membership; role checks unchanged. | Granular permissions keyed by org + resource. |
| Jobs + applications ATS model | partial | **Job = `requisition_item`**: `/api/v1/jobs` and `/api/v1/jobs/[jobId]` alias scoped items; applications/candidates carry `organization_id`. | Product decision: keep alias or split `jobs` table; public naming consistency. |
| Pipeline stage automation | partial | `pipeline_stage_definitions` + `/api/pipeline/stages`; `ats_automation_rules` + `/api/automation/rules`; item/requisition workflow engines unchanged. | Rule evaluation workers tied to stage transitions + SLA. |
| Candidate 360 profile | partial | Candidate + application sync + interviews; multi-tenant filters on list/detail. | Timeline, notes, cross-job applications, comms history. |
| Interview panelist + scorecards | partial | `interview_panelists`, `interview_scorecards`; `/api/interviews/[id]/panelists`, `/api/interviews/[id]/scorecards`. | HR UI in `CandidateDetailModal` + aggregation/read models for decisions. |
| Google Calendar/Meet/Gmail | partial | Stub `/api/integrations/google/oauth/start` (flag `GOOGLE_WORKSPACE_INTEGRATION_ENABLED`); `organizations.google_oauth_tokens` column. | Real OAuth, encrypted tokens, Calendar/Gmail workers. |
| Bulk import/export and async processing | partial | `bulk_import_jobs`; `/api/bulk-import`; BullMQ queue `bulk-import`; `npm run worker:bulk-import` (stub processor). | CSV/Excel parsers, progress UI, dead-letter handling. |
| Career page + public apply + candidate portal | partial | `/api/public/apply/[slug]` with in-memory rate limit; `/api/candidate-portal/tokens` (staff) + `/api/candidate-portal/me?token=`. | Public Next.js career pages, magic-link email delivery, uploads from portal. |
| Notifications system | partial | `notification_events` ledger; `/api/notifications/events` (enqueue/list stub). | Template engine, user prefs, worker delivery (email/SMTP), in-app inbox. |
| Reports and analytics suite | partial | `/api/reports/ats-funnel` (stage counts per org); existing HR/manager dashboards. | Time-to-hire, source attribution, exports, scheduled reports. |
| Audit and compliance enhancements | partial | Audit logs; core ATS entities org-scoped. | Compliance exports, retention, org-filtered audit UIs. |
| Object storage (S3/MinIO) | partial | `src/lib/storage/s3-storage.ts` (S3/MinIO via `@aws-sdk/client-s3`); JD/resume paths still local-first. | Wire `STORAGE_DRIVER=s3` into JD/resume upload paths; blob migration tool. |
| Security hardening (rate limits, CSRF, encryption) | partial | CSRF middleware; public apply rate limit (`PUBLIC_RATE_LIMIT_*` env). | Global API rate limits, secret rotation, field encryption for PII. |
| Performance + observability + E2E | partial | `x-request-id`; structured JSON log on `/api/health`; Playwright `tests/e2e/health.spec.ts` + `npm run test:e2e`. | Tracing, metrics, broader E2E (login, apply, TA path). |

## Execution Order

1. Multi-tenant and auth foundation.
2. ATS core data model + API surface.
3. Interview/feedback expansion.
4. Queue + integrations.
5. Public portal + reports + notifications.
6. Production hardening and tests.
