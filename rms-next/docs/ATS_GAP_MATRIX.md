# ATS Gap Matrix

This matrix maps the target RMS ATS plan to the current implementation status.

Status legend:
- `implemented`: usable in current system.
- `partial`: exists but does not satisfy target scope.
- `missing`: not implemented in current system.

| Plan Area | Status | Current Coverage | Required Implementation |
|---|---|---|---|
| Foundation stack (Next.js + Drizzle + PostgreSQL) | implemented | Existing app uses Next.js App Router, TypeScript, Drizzle ORM, Postgres. | Keep and extend. |
| Multi-tenant organizations | missing | No `organizations` table or tenant scoping. | Add org model, tenant FKs, scoped queries, RLS strategy. |
| Auth.js v5 auth stack | partial | Custom JWT auth with role checks exists. | Add Auth.js v5 and bridge with existing JWT while migrating. |
| Role/permission model with scoped assignments | partial | `roles`, `user_roles` and role checks exist. | Add granular permissions and assignment scopes. |
| Jobs + applications ATS model | missing | Current model is requisitions + requisition items. | Add jobs/applications/pipelines/stages model and adapters. |
| Pipeline stage automation | partial | Workflow engines and transition rules exist for requisitions/items. | Add ATS pipeline-stage automation model and rules. |
| Candidate 360 profile | partial | Candidate + interview + audit data exists. | Expand with activity timeline, notes, files, email threads, cross-job applications. |
| Interview panelist + scorecards | partial | Interview CRUD exists. | Add panelists, structured feedback, scorecards, decision support. |
| Google Calendar/Meet/Gmail | missing | No Google integration layer. | Add OAuth, token encryption, scheduling sync, outbound email integration. |
| Bulk import/export and async processing | missing | No queue orchestration for large async operations. | Add BullMQ + Redis workers + operation tracking. |
| Career page + public apply + candidate portal | missing | No public ATS career routes and self-service portal. | Add public APIs/pages and candidate self-service flows. |
| Notifications system | missing | No in-app/email/push notification center. | Add notification events, preferences, delivery channels. |
| Reports and analytics suite | partial | Existing dashboards and metrics endpoints exist for current RMS workflow. | Add ATS funnel/time-to-hire/source/recruiter/interviewer reports and exports. |
| Audit and compliance enhancements | partial | Audit logs exist for core actions. | Add richer compliance exports, retention controls, and organization scoping. |
| Object storage (S3/MinIO) | partial | Current uploads are local-file based. | Add S3/MinIO storage adapters and migration path. |
| Security hardening (rate limits, CSRF, encryption) | partial | Auth + validation exists. | Add full security controls and policy-driven hardening. |
| Performance + observability + E2E | partial | Basic app runtime exists, no full production hardening stack. | Add tracing/monitoring, performance tuning, E2E coverage. |

## Execution Order

1. Multi-tenant and auth foundation.
2. ATS core data model + API surface.
3. Interview/feedback expansion.
4. Queue + integrations.
5. Public portal + reports + notifications.
6. Production hardening and tests.
