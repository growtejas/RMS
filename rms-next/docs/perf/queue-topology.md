# Queue topology and isolation contract (Phase 7)

This document captures the production rules for the BullMQ fleet. The
ESLint config in `.eslintrc.json` mechanically enforces (1) and (2);
the rest is policy.

## Invariants

1. **Web request handlers MUST NOT import worker modules.** Importing
   from `@/lib/queue/workers/*` from a route handler or a React
   component will fail lint. Workers are separate processes; producing
   into a queue uses the producer modules
   (`@/lib/queue/<name>-queue.ts`).
2. **Workers MUST NOT import client / route code.** `src/components/**`
   and `src/app/**` are off-limits from worker entry points. Workers
   must run on Node without React / Next runtime helpers in scope.
3. **Producer modules use the shared queue registry.** No call site
   constructs a fresh `new Queue(name, ...)`. The registry guarantees
   one long-lived BullMQ + ioredis connection per queue, per process.
4. **Each queue declares an explicit policy** in
   `src/lib/queue/queue-policies.ts`: concurrency, lockDuration,
   retention, and priority. The Worker constructors read these.

## Priority lanes

| Lane    | Queues                                                    | Reason                                |
|---------|-----------------------------------------------------------|---------------------------------------|
| HIGH    | `notification-delivery`                                   | Recruiter-visible (email send-back)   |
| DEFAULT | `ai-evaluation`, `ai-eval-backfill`, `lifecycle-reminders`, `inbound-events` | Background but feeds recruiter UX |
| LOW     | `cie-intelligence`, `resume-structure`, `bulk-import`      | Long-running batch / parsing          |

## Repeat jobs

Repeat-only queues (`ai-eval-backfill`, `lifecycle-reminders`) run on a
single dedicated worker instance to avoid duplicate scheduling across
pods. Mark them with `repeatOnly: true` in `queue-policies.ts` and
deploy exactly one Pod / instance running their worker scripts:

- `npm run worker:ai-eval-backfill`
- `npm run worker:lifecycle-reminders` (when introduced)

## Operational checklist

When adding a new queue:

1. Add an entry to `QUEUE_POLICIES` in `queue-policies.ts`.
2. Producer file imports `getSharedQueue` and `jobOptionsFor`.
3. Worker file constructs the `Worker` with `concurrency` and
   `lockDuration` from the policy table.
4. Add a `worker:<name>` script in `package.json`.
5. Add the queue's lane and ownership row to the table above.
