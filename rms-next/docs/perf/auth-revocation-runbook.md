# Auth Revocation Runbook

The Phase 1 auth fast path (`requireGetIdentity`) trusts JWT claims for read
endpoints, so the system cannot rely on a database `is_active` flip to lock
a user out. This runbook is the operational contract for revocation.

## 1. Revocation primitives

| Primitive | Latency | When to use |
| --- | --- | --- |
| Short access TTL (default 5 min) | ≤ 5 min | Routine revocation. Refresh fails ⇒ user logs out next refresh. |
| Redis denylist (`auth:denylist:<jti>`) | < 1 s globally; < 5 s per pod | Manual revocation, role change, suspected compromise. |
| Refresh-token rotation | Immediate on next refresh | Combine with denylist for full lockout. |

## 2. Standard revocation playbook

Goal: a logged-in user must lose access within 30 seconds.

1. Mark the user inactive in Postgres (`UPDATE users SET is_active = false`).
2. Find every active access token's `jti` for the user. For internal admin
   actions this is the value already returned by login + refresh; for
   support flows, use the `jti` claim from the access token captured by the
   support tool.
3. Publish each `jti` to Redis with the remaining access lifetime:

   ```sh
   redis-cli SET auth:denylist:<jti> 1 PX <remaining_ms>
   ```

   Or call `publishJtiDenylist(jti, expSec)` from a server action.
4. Refresh tokens for the user are rotated by the existing logout flow when
   they next reach `/api/auth/logout`; for forced rotation, increment a
   `refresh_token_version` column and reject tokens whose version differs.

## 3. Observability of a revocation

The `withRequestPerf` log fields surface every step:

- `auth_path = claims` ⇒ trusted, no DB lookup.
- `auth_path = claims_denied` ⇒ denylist hit; the request returned 401.
- `auth_path = claims_partial` ⇒ legacy token without `jti`; fell back to
  the DB-backed path. Should be 0 once the access-TTL window has elapsed
  after Phase 1 rollout.
- `auth_path = db_cached` ⇒ write path served from the LRU.
- `auth_path = db_fresh` ⇒ write path went to Postgres (the only DB hit).

The dashboards in `docs/perf/observability.md` already have the panels.

## 4. Chaos validation (readiness gate)

These two scenarios must pass before the system is declared ready (see
Phase 9 in the plan):

1. **Kill Redis for 30 s.** The web tier must keep serving GETs (denylist
   reads degrade to "miss" and short access TTL becomes the lone control).
   Workers may backlog; verify they recover when Redis returns.
2. **Worker hot-loop.** A worker pod consumes 100% CPU on `cie-intelligence`
   for 5 minutes. Web pod TTFB p95 is unchanged. This proves the
   `getWorkerDb()` / `getReadDb()` isolation introduced in Phase 5.

## 5. Rollback

If the fast path proves unsafe in production, set
`RMS_AUTH_FASTPATH=false`. Every authenticated request falls back to the
legacy DB-backed resolver immediately (no deploy required). Latency
regresses to baseline; correctness is unchanged.
