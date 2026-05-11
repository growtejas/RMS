# RMS Performance Architecture — Production Readiness Checklist

Final gate from [Section 12 of the plan](../../../.cursor/plans/rms_performance_architecture_11927fc0.plan.md).
This document is the single source of truth for "are we done". It is
deliberately small and operational — every checkbox maps to a concrete
artifact already in the repo.

## 1. Code-resident gates

| # | Gate | Where |
| --- | --- | --- |
| 1.1 | Hot routes traced via `withRequestPerf` | `audit-logs/route.ts`, `requisitions/[reqId]/status-history/route.ts`, `auth/session/route.ts`, `auth/refresh/route.ts`, `ranking/requisition-items/[itemId]/route.ts`, `applications/pipeline/route.ts`, `users/route.ts`, `requisitions/[reqId]/candidates-workspace/route.ts` |
| 1.2 | Auth fast path with `jti` denylist | `src/lib/auth/identity-fastpath.ts`, dispatcher in `src/lib/auth/api-guard.ts` |
| 1.3 | Logout publishes `jti` to Redis denylist | `src/app/api/auth/logout/route.ts` |
| 1.4 | Singleton BullMQ producer + bulk enqueue | `src/lib/queue/queue-registry.ts`, `enqueueAiEvaluationJobsBulk` |
| 1.5 | Ranking GET has no enqueue side effect | `src/app/api/ranking/requisition-items/[itemId]/route.ts` (gated by `RMS_RANKING_NO_ENQUEUE`) |
| 1.6 | SSE replaces 4 s polling for AI scores | `src/app/api/ranking/requisition-items/[itemId]/events/route.ts`, `useAtsAiScoreStream` in `src/hooks/useAtsBoard.ts` |
| 1.7 | Per-class DB factories | `getDb`, `getReadDb`, `getWorkerDb` in `src/lib/db/index.ts` |
| 1.8 | Read replica wired into hot read repos | `audit-logs-read.ts`, `requisitions-read.ts`, `applications-repo.ts` (workspace queries), `tenant/org-assert.ts` |
| 1.9 | RSC shell + tab islands | `app/ta/requisitions/[id]/page.tsx`, `RequisitionDetailRoot.tsx`, `loading.tsx` |
| 1.10 | TaShell never blocks on `isHydrating` | `src/components/ta/TaShell.tsx` |
| 1.11 | React Query `qk` namespace + per-domain `staleTime` | `src/lib/query/keys.ts`, `src/lib/query/hooks.ts` |
| 1.12 | Auth context split (state vs actions) | `src/contexts/AuthContext.tsx`, `src/contexts/useAuth.ts` |
| 1.13 | Virtualized lists | `src/components/ui/VirtualList.tsx`, used by `AuditTimeline.tsx` and `CandidatesWorkspaceTabPanel.tsx` |
| 1.14 | Queue policies (concurrency / lock / retention / priority) | `src/lib/queue/queue-policies.ts` |
| 1.15 | "Web ↛ worker / worker ↛ client" lint | `.eslintrc.json` |
| 1.16 | OpenTelemetry SDK (gated) | `src/instrumentation.ts` |
| 1.17 | RUM ingest endpoint | `src/app/api/rum/route.ts`, `src/components/perf/WebVitalsReporter.tsx` |
| 1.18 | Prometheus `/api/metrics` for BullMQ | `src/app/api/metrics/route.ts`, `src/lib/metrics/queue-metrics.ts` |

## 2. Operational gates

| # | Gate | Owner |
| --- | --- | --- |
| 2.1 | Dashboards green against Section 0 budgets for one week of business hours | SRE |
| 2.2 | Synthetic recruiter journey p95 < 2 s | SRE — k6 script: `tests/load/k6-recruiter-journey.js` |
| 2.3 | Chaos: kill Redis 30 s — web stays responsive | SRE — runbook: [`chaos-runbook.md`](./chaos-runbook.md) §1 |
| 2.4 | Chaos: worker hot-loops one queue — web TTFB unchanged | SRE — runbook: [`chaos-runbook.md`](./chaos-runbook.md) §2 |
| 2.5 | k6 500-VU 10-min run within budget | SRE — `K6_USERS=500 K6_DURATION=10m k6 run tests/load/k6-recruiter-journey.js` |
| 2.6 | Auth contract documented + revocation runbook | Engineering — [`auth-revocation-runbook.md`](./auth-revocation-runbook.md), [`observability.md`](./observability.md) §6 |
| 2.7 | Rollback flags wired and tested | Engineering — see §3 |

## 3. Rollback flags

The plan calls out three flags. All are wired to live code paths and
default to the new behaviour. Setting any to `false` reverts to the
pre-Phase behaviour with no deploy required.

| Flag | Default | Effect when `false` | Code site |
| --- | --- | --- | --- |
| `RMS_AUTH_FASTPATH` | (unset = on) | `requireBearerUser` calls the legacy DB-backed resolver on every request. | `src/lib/auth/api-guard.ts`, `src/lib/auth/identity-fastpath.ts` |
| `RMS_RANKING_NO_ENQUEUE` | (unset = on) | Restores the in-line per-request enqueue inside the ranking GET. | `src/app/api/ranking/requisition-items/[itemId]/route.ts` |
| `RMS_USE_READ_REPLICA` | (unset = on if `DATABASE_READ_URL` set) | `getReadDb()` returns the primary handle. | `src/lib/db/index.ts` |

## 4. Sign-off

Sign once each box above is checked:

- [ ] Engineering — code-resident gates verified at the listed file paths.
- [ ] SRE — operational gates verified across staging + production.
- [ ] Product — synthetic recruiter journey passes business expectations.

When all three sign, this plan is **done**. Subsequent perf work goes
through normal change management; the dashboards keep enforcing the
Section 0 budgets.
