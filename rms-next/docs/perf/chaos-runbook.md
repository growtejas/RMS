# RMS Chaos Test Runbook

These two scripts are part of the production readiness gate (Section 12 of
the [performance architecture plan](../../../.cursor/plans/rms_performance_architecture_11927fc0.plan.md)).

The system is **not** declared ready until both pass with all dashboards
remaining green against the Section 0 budgets.

## 1. Kill Redis for 30 seconds

**Hypothesis.** With Redis down, the web fleet stays responsive on read
paths because:

- The auth fast path falls back to "miss" on the denylist (short access TTL
  is the primary revocation control).
- The ranking GET no longer enqueues, so a Redis outage cannot stall the
  request path. Only background workers are affected.

**Procedure.**

1. Drive load against staging with the k6 journey at 100 VU
   (`tests/load/k6-recruiter-journey.js`).
2. Stop the Redis service for 30 seconds:
   ```sh
   docker stop rms-redis
   sleep 30
   docker start rms-redis
   ```
3. Watch the API latency dashboard.

**Pass criteria.**

- TTFB p95 (GET) stays below 1.5x baseline during the outage.
- No GET returns 5xx.
- Worker queue depth grows but recovers within 5 minutes after Redis
  returns (visible on the queue health dashboard).
- No persistent `auth_path = claims_partial` spikes in `perf_request_summary`
  logs (legacy fallback should not become the dominant path).

## 2. Worker hot-loop (queue starvation)

**Hypothesis.** A worker pod consuming 100% CPU on `cie-intelligence`
cannot starve the recruiter request path because workers and the web tier
have separate connection pools and Redis client instances.

**Procedure.**

1. With the k6 journey running at 100 VU, deploy a worker pod with
   artificially heavy `cie-intelligence` jobs (e.g. by enqueuing 1000
   `cie-rebuild` jobs at LOW priority).
2. Confirm one worker is pinned at 100% CPU.

**Pass criteria.**

- Web TTFB p95 unchanged (within 5% of baseline) for 10 minutes.
- Web `getDb()` pool saturation never exceeds 60% steady.
- The `notification-delivery` queue (HIGH priority) keeps draining.
- ATS ranking GET is not affected (proves that the worker fleet's writes
  to Postgres do not contend with the web pool through pgBouncer).

## 3. Cleanup

After both runs:

- Snapshot the dashboards into `docs/perf/baseline-YYYY-MM-DD.md` next to
  the baseline numbers.
- Update [`observability.md`](./observability.md) if any alerts misfired
  (false positive ⇒ tighten threshold; false negative ⇒ add a panel).
- File a follow-up ticket for any worker job that did not respect its
  `lockDuration` from `queue-policies.ts` (those jobs are subject to
  silent restart and should not exist by design).
