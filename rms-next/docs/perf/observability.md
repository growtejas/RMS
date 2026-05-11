# RMS Performance Observability (Phase 8)

This document codifies the observability surface delivered with Phase 8 of
the [RMS performance architecture plan](../../../.cursor/plans/rms_performance_architecture_11927fc0.plan.md).
It is the contract that every dashboard, alert, and runbook references.
For local bring-up instructions, see [`local-observability-stack.md`](./local-observability-stack.md).

## 1. Surfaces

| Surface | Source | Endpoint | Notes |
| --- | --- | --- | --- |
| Distributed traces | OpenTelemetry SDK (Node) | OTLP exporter | Enabled when `RMS_OTEL_ENABLED=true`. Auto-instruments HTTP, pg, redis, bullmq. |
| Server logs (perf) | `withRequestPerf` | stdout (structured JSON) | Buckets: `auth_ms_jwt`, `auth_ms_user_db`, `auth_ms_org_db`, `queue_ms_enqueue`, plus per-route DB query count and total ms. |
| Browser RUM | `WebVitalsReporter` (mounted in `Providers`) | `POST /api/rum` | Beacon-delivered LCP / INP / CLS / TTFB / FCP + synthetic `HYDRATION` metric. |
| Queue metrics | `prom-client` registry | `GET /api/metrics` | BullMQ depth + active + failed + delayed + waiting per queue, plus default Node process metrics. |
| Worker metrics | `prom-client` (per worker) | Worker scrape sidecar | Each worker exposes its own metrics endpoint when launched as a sidecar; see `src/lib/queue/workers/`. |

## 2. Performance budgets (Section 0 of the plan)

These thresholds are the single source of truth for alerting.

| Metric | Budget | Source |
| --- | --- | --- |
| TTFB p50 (warm GET, authenticated) | 80 ms | OTel HTTP server span / `perf_request_summary.duration_ms` p50 |
| TTFB p95 (warm GET, authenticated) | 250 ms | Same, p95 |
| TTFB p95 (write/admin) | 600 ms | Same, filtered to non-GET |
| INP p75 (TA detail interactions) | 200 ms | `rum_web_vitals` where `metric_name="INP"` |
| Hydration / TTI on requisition detail (4G) | 1.5 s | `rum_web_vitals` where `metric_name="HYDRATION"` |
| Web pod DB pool saturation (steady) | < 60% | pgBouncer `cl_active / cl_max` |
| Web pod DB pool saturation (burst) | < 85% | pgBouncer `cl_active / cl_max` |
| DB queries per read GET | <= 1 + route data (auth = 0) | `perf_request_summary.db_query_count` |
| BullMQ enqueue p95 | 20 ms | `perf_request_summary.queue_ms_enqueue` |
| Per-request enqueue calls from hot GETs | 0 | Same; alert on any value > 0 from `route` matching ranking GET |
| LCP p75 | 2.5 s | `rum_web_vitals` where `metric_name="LCP"` |
| React commit p95 on tab switch | 50 ms | `rum_web_vitals` (custom emission added with React Profiler instrumentation) |

## 3. Dashboards

The four target dashboards (Grafana / Datadog) all source the same metrics.
The bullets below describe the panels to provision; they intentionally
read like a panel list because that is the contract.

### 3.1 API latency

- p50 / p95 / p99 of HTTP server span duration, broken out by route.
- Stacked decomposition per route: `auth_ms_jwt`, `auth_ms_user_db`,
  `auth_ms_org_db`, queue time, DB time, app time. Source: `perf_request_summary`.
- Top 10 slowest routes in the last 1 hour (heatmap).
- Auth fast path adoption: count of requests with `auth_path="claims"` vs
  `auth_path="db_full"` (target: 100% of GETs on claims after rollout).

### 3.2 Pool health

- Web `postgres()` connection pool saturation per pod.
- pgBouncer client/server pool waits, queue depth.
- Worker `postgres()` pool saturation per worker class.
- Long transactions (> `statement_timeout * 0.8`).

### 3.3 React UX (RUM)

- LCP / INP / CLS p75 by route.
- TTFB p75 (browser-observed) by route.
- HYDRATION p75 by route (synthetic; emitted by `WebVitalsReporter`).
- Sample distribution: counts per metric name in the last 24 h. Use this to
  detect missing instrumentation rather than infer from latency.

### 3.4 Queue health

Source: `/api/metrics` Prometheus scrape on the web fleet, plus per-worker
scrape endpoints.

- `rms_queue_total_jobs{queue}` per queue, area chart.
- `rms_queue_active_jobs{queue}` and `rms_queue_waiting_jobs{queue}` overlay.
- `rms_queue_failed_jobs{queue}` rate-of-change.
- Worker concurrency utilization (active / `concurrency`).
- Repeat-job lag: time since last successful run for `ai-eval-backfill` and
  `lifecycle-reminders`.

## 4. Alerting

Alerts are tuned to the budgets above with a 5 minute window unless stated
otherwise. Prefer p95/p99 over averages.

| Alert | Condition | Severity |
| --- | --- | --- |
| TTFB p95 (GET) | `histogram_quantile(0.95, rate(http_server_duration_ms_bucket{method="GET"}[5m])) > 0.25s` for 10 min | Page (sev2) |
| TTFB p95 (write) | Same with `method!="GET"` and threshold `0.6s` | Page (sev2) |
| Auth fast path miss | `sum(rate(perf_request_summary{auth_path="db_full",method="GET"}[5m])) > 0` for 10 min | Warn (after rollout) |
| INP p75 | RUM aggregate > 0.2 s over 30 min (route group `ta_requisition_detail`) | Warn |
| LCP p75 | RUM aggregate > 2.5 s over 30 min | Warn |
| DB pool saturation | pgBouncer `cl_active/cl_max` > 0.85 for 5 min | Page |
| Worker DB pool saturation | per-worker > 0.85 for 5 min | Warn (workers absorb load by design) |
| Queue lag | `rms_queue_waiting_jobs{queue="ai-evaluation"} > 200` for 10 min | Warn |
| Queue lag (notifications) | `rms_queue_waiting_jobs{queue="notification-delivery"} > 50` for 5 min | Page |
| Queue failures spike | `increase(rms_queue_failed_jobs[15m]) > 25` | Warn |
| `ai-eval-backfill` stalled | No success in last 10 min | Page |
| Hot-GET enqueue | Any `perf_request_summary` from a ranking GET with `queue_ms_enqueue` > 0 | Warn (regression on Phase 4 invariant) |

## 5. Rollback / safety toggles

These toggles are wired into the same routes as the observability hooks so a
regression can be reverted without a deploy:

- `RMS_AUTH_FASTPATH=false` — disables the claims-trust GET path.
- `RMS_RANKING_NO_ENQUEUE=false` — restores in-line ranking-GET enqueue.
- `RMS_USE_READ_REPLICA=false` — sends reads back to the primary.
- `RMS_OTEL_ENABLED=false` — turns the SDK off (no exporter pressure).
- `METRICS_BEARER_TOKEN` — required to scrape `/api/metrics` in production.

## 6. Paginated list-route budgets (Standardized Pagination Rollout)

Every paginated GET that returns the canonical `PaginatedEnvelope<T>` is held
to the budgets below. They are tighter than the global TTFB budgets because
list endpoints power most landing screens. Source for the timing column is the
same `perf_request_summary` log emitted by `withRequestPerf`.

| Route | TTFB p95 (warm) | TTFB p95 (cold) | Notes |
| --- | --- | --- | --- |
| `GET /api/cie/candidates` | 250 ms | 600 ms | LIMIT/OFFSET via `selectCieCandidatesPaged`. |
| `GET /api/candidates` | 250 ms | 600 ms | Org-scoped global roster, LIMIT enforced. |
| `GET /api/applications` | 300 ms | 700 ms | Joined query against requisitions/items. |
| `GET /api/requisitions/[reqId]/candidates-workspace` | 300 ms | 700 ms | Per-req workspace, includes ranking flags. |
| `GET /api/requisitions` | 250 ms | 600 ms | Org list. |
| `GET /api/requisitions/my` | 250 ms | 600 ms | Current-user subset. |
| `GET /api/v1/jobs` | 250 ms | 600 ms | Public jobs feed. |
| `GET /api/interviews`, `/interviews/my`, `/manager/interviews` | 350 ms | 800 ms | Currently slices in memory; budget tightens after Phase 8 SQL pushdown. |
| `GET /api/audit-logs` | 300 ms | 700 ms | Backed by `audit_log(performed_at desc)` + `entity` indexes. |
| `GET /api/workflow/audit/[reqId]` | 350 ms | 800 ms | In-memory slice over `idx_wta_entity_createdat`. |
| `GET /api/requisitions/[reqId]/status-history` | 200 ms | 500 ms | Tiny per-req list. |
| `GET /api/notifications/events` | 250 ms | 600 ms | Org-scoped, newest-first. |
| `GET /api/bulk-import` | 250 ms | 600 ms | Org-scoped, newest-first. |
| `GET /api/admin/users`, `/admin/access-requests` | 250 ms | 600 ms | Admin lists; small N. |
| `GET /api/skills`, `/locations`, `/departments`, `/company-roles` | 200 ms | 500 ms | Reference catalogs; in-memory slice today. |
| `GET /api/hr/employees`, `/hr/skills-summary` | 300 ms | 700 ms | Wide aggregates over `employees`. |
| `GET /api/employees/employees` | 300 ms | 700 ms | Talent pool; in-memory slice today. |
| `GET /api/referrals` | 250 ms | 600 ms | Backed by `idx_candidates_org_referral_createdat`. |

Every entry above has at least one covering index in `drizzle/0028_pagination_indexes.sql`
or in pre-existing schema. When adding a new paginated route, add a row here and
a covering index migration in the same PR.

## 7. Authentication contract (used by alerting)

- All GET / HEAD / OPTIONS handlers authenticate via `requireGetIdentity`
  (claims-trust + `jti` denylist). They emit `auth_path="claims"` or
  `auth_path="claims_legacy_no_jti"` for legacy tokens during cutover.
- All other methods authenticate via `requireWriteIdentity` (LRU + DB) and
  emit `auth_path="db_lru"` (cache hit) or `auth_path="db_full"` (miss).
- Logout / role-change publishes the token's `jti` to
  `auth:denylist:<jti>` in Redis; the fast path consults a 5-second local
  cache plus that key.
- Revocation runbook lives in `docs/perf/auth-revocation-runbook.md`.
