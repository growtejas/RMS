# Business Logic Context

## System Purpose

The system manages end-to-end hiring fulfillment:
- Convert staffing demand into approved requisitions.
- Execute hiring pipeline per requisition item.
- Progress candidates from sourcing to hire.
- Convert hired candidates into employees.
- Keep transitions auditable and role-governed.

## Core Business Entities

- **Requisition (header):** the parent demand record raised by a manager.
- **Requisition Item (line):** an individual position to be filled under a requisition.
- **Candidate:** a person attached to a requisition item and stage.
- **Application:** pipeline-facing representation of candidate progression.
- **Interview:** a scheduled evaluation round for a candidate.
- **Employee:** final onboarded record created when a candidate is hired.
- **Notification Event:** lifecycle email event with idempotency and delivery status.

## Roles and Decision Rights

- **Manager**
  - Creates requisitions in draft.
  - Edits own requisitions while unlocked.
  - Can submit requisition for approvals.
- **HR/Admin**
  - Approves budget and HR stages.
  - Assigns or reassigns TA.
  - Can perform broader workflow controls (reject/cancel/reopen).
- **TA**
  - Works assigned requisition items through sourcing, shortlist, interview, offer, fulfill.
  - Manages candidate progression for owned items.
- **Interviewer (panelist)**
  - Participates in interviews and submits scorecard/feedback.

## Workflow 1: Requisition Header Lifecycle

State model:
- `Draft`
- `Pending_Budget`
- `Pending_HR`
- `Active`
- `Fulfilled`
- `Rejected`
- `Cancelled`

Main flow:
1. Manager creates requisition as `Draft`.
2. Submit action moves to `Pending_Budget`.
3. Budget approval moves to `Pending_HR`.
4. HR approval moves to `Active`.
5. When all items are terminal, header auto-recalculates:
   - At least one fulfilled item and no active items -> `Fulfilled`
   - No fulfilled items and no active items -> `Cancelled`

Exceptional flow:
- `Reject` requires minimum reason length.
- `Cancel` requires minimum reason length and also cancels all non-terminal items.
- `Reopen for revision` can move rejected header back to `Draft` and clears approval actors.

Guardrails:
- Terminal header states block normal forward transitions.
- Role-based authorization controls each transition.
- Version-based concurrency check is used to avoid stale updates.

## Workflow 2: Requisition Item Lifecycle

State model:
- `Pending`
- `Sourcing`
- `Shortlisted`
- `Interviewing`
- `Offered`
- `Fulfilled`
- `Cancelled`

Main flow:
1. Item starts as `Pending`.
2. TA assignment triggers auto-transition to `Sourcing` when first assigned.
3. TA advances item to `Shortlisted`.
4. TA starts interview stage -> `Interviewing`.
5. TA issues offer -> `Offered`.
6. TA fulfills item with a valid employee id -> `Fulfilled`.

Backward/recovery transitions:
- `reSource`: move back to `Sourcing` with mandatory reason.
- `returnToShortlist`: move back to `Shortlisted` with mandatory reason.
- `offerDeclined`: move from `Offered` back to `Interviewing` with reason.

Assignment controls:
- HR/Admin can assign or swap TA.
- TA can self-assign in restricted scenarios.
- TA can modify only items assigned to self (or to header-assigned TA fallback).

Parent dependency:
- Item status changes are allowed only when parent requisition is in allowed header state (`Active` gate).

## Workflow 3: Budget Lifecycle (Header + Item Coupled)

Item-level budget actions:
- **Edit estimated budget**: allowed in early states with role checks.
- **Approve budget**: allowed in `Pending_Budget` and requires positive amount.
- **Reject budget**: clears approved budget and records reason.

Auto progression rule:
- If all items under a requisition have approved budgets > 0, header auto-moves:
  - `Pending_Budget` -> `Pending_HR`

Budget integrity rules:
- Cannot edit estimated budget after approval exists.
- Currency format is validated.
- Approval/rejection authority is role-restricted.

## Workflow 4: Candidate and Application Lifecycle

Candidate stage model:
- `Sourced`
- `Shortlisted`
- `Interviewing`
- `Offered`
- `Hired`
- `Rejected`

Allowed transitions are explicit and validated.

Creation flow:
1. Candidate is created against a requisition item.
2. Candidate starts at `Sourced`.
3. System ensures an application exists for the candidate (idempotent sync).
4. Resume parsing, profile enrichment, and AI evaluation jobs are queued best-effort.

Stage coupling rules:
- Candidate stage changes update/sync the related application stage.
- Moving to `Offered` or `Hired` enforces requisition item progression up to `Offered`.
- Moving to `Hired`:
  - Creates an employee record from candidate.
  - Fulfills requisition item with that employee.
  - Auto-rejects other non-terminal candidates on same item.

## Workflow 5: Interview Lifecycle

Interview schedule rules:
- Candidate and application linkage must exist for selected requisition item.
- Schedule window must be valid and not in the past.
- Interviewers must belong to org and must be conflict-free for time window.
- Duplicate round/name constraints are enforced by DB constraints.

Lifecycle events:
- Create interview:
  - Persists panelists and audit entry.
  - Triggers side effects (calendar sync, reminders, notifications).
- Patch interview:
  - Supports reschedule/status/interviewer updates with validation.
  - Reschedule updates reminder jobs and emits reschedule notifications.
- Cancel interview:
  - Removes reminder jobs.

Manager-specific behavior:
- Managers can update limited fields (result/feedback/notes only).

## Workflow 6: Notifications and Side Effects

Notification strategy:
- Lifecycle events are stored first as notification events.
- Idempotency keys prevent duplicate sends for core transitions.
- Delivery is queued and can also be processed immediately best-effort.

Current event families:
- Candidate shortlisted
- Interview scheduled (candidate + interviewer variants)
- Interview rescheduled
- Interview reminders (24h / 1h)
- Offer status changed

Operational pattern:
- Side effects are intentionally best-effort (failures should not roll back core transaction).
- Queue integrations are optional in degraded mode.

## Cross-Cutting Business Invariants

- Every workflow-changing action is auditable.
- Unauthorized roles cannot progress restricted transitions.
- Terminal states are protected from invalid mutation.
- Header status is a function of item terminal outcomes.
- Candidate hire is the bridge from recruiting workflow to employee allocation.
- Business operations are organization-scoped and cannot cross tenant boundary.

## End-to-End Business Workflow (Narrative)

1. Manager raises a requisition with one or more items.
2. Requisition is submitted and budget-reviewed item by item.
3. Once all item budgets are approved, requisition advances to HR approval and becomes active.
4. HR/Admin assigns TA ownership.
5. TA sources candidates, shortlists, schedules interviews, and manages offer process.
6. Candidate marked hired triggers employee creation and item fulfillment.
7. Once all items are fulfilled or cancelled, requisition closes automatically.
8. Audit logs and notifications preserve operational traceability throughout.
