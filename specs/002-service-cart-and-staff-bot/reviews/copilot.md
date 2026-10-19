# SpecKit Re-Review: 002-service-cart-and-staff-bot

**Reviewer**: copilot
**Reviewed at**: 2026-10-19T18:32:56+04:00
**Commit**: unavailable (attached artifacts are not a Git worktree)
**Artifacts reviewed**: updated spec.md, plan.md, tasks.md; prior architecture.md and requirements.md; PostgreSQL, Telegram Bot API, and Inngest documentation

## Summary

The update closes many concrete defects from the previous review: resource-scoped exclusion, staff actor/chat separation, delayed-payment states, schedule versioning, single-use reschedule inputs, Telegram redaction, fulfillment, and substantially better tests are now represented. The package is still blocked by missing mandatory governance evidence and by an ambiguous cancellation event model that can suppress the very client reminder and auto-cancellation workflows the feature is intended to provide. The state machine also records staff/payment-driven cancellations as client actions, which is an audit and business-logic defect.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| R1 | CRITICAL | Constitution / gate | `.specify/memory/constitution.md` is still absent, although this review protocol declares it required. Principle VI/X compliance and the exact implementation gate cannot be verified. | Supply the constitution and rerun the review; do not treat absence as PASS. |
| R2 | CRITICAL | Commercial / GTM | The referenced business plan v18.3 or a waiver is still absent. This feature changes checkout, pay-on-site, delayed invoicing, staff labor, support, and external messaging, so commercial drift cannot be verified. | Supply the exact business plan artifact or waiver and trace the feature to its hard laws, SKU boundaries, price floor, and delivery scope. |
| R3 | CRITICAL | Durable jobs / semantics | `cancelOn: order/confirmed` is underspecified. The state model has staff confirmation and client confirmation. If emitted for `CONFIRMED_BY_STAFF`, both the reminder and auto-cancel job can be canceled before the client confirms, defeating US3. `order/paid` is also listed in plan cancellation rules for the reminder, although a paid appointment can still require a reminder. Tasks T-108/T-110 do not match the plan's cancellation set. | Replace generic events with explicit domain events such as `order/client-confirmed`, `order/cancelled`, `order/rescheduled`, and `order/fulfilled`. Define per-function cancellation tables and tests proving that staff approval and payment do not suppress required reminders. |
| R4 | HIGH | State machine / audit | The matrix maps payment expiry, staff rejection, and staff blacklisting to `ConfirmationStatus.CANCELLED_BY_CLIENT`. These events were not initiated by the client, corrupting audit semantics and any analytics or policy keyed to cancellation cause. | Separate lifecycle status from cancellation reason. Add values such as `CANCELLED_BY_STAFF`, `CANCELLED_PAYMENT_EXPIRED`, `CANCELLED_BLOCKED`, and reserve `CANCELLED_BY_CLIENT` for an actual client action. |
| R5 | HIGH | Migration / zero downtime | The plan calls the procedure a “strict 4-phase” migration but documents only Expand, Constraint Cutover, and down migration. `ADD CONSTRAINT ... EXCLUDE` plus dropping the old constraint remains a blocking cutover; a 2-second `lock_timeout` limits damage but does not make it zero-downtime or online. No deploy compatibility matrix says which application version can run while both constraints/nullable `itemId` are present. | Rename the claim or document four real deployment phases, old/new application compatibility, retry orchestration, traffic-drain decision, metrics, abort criteria, and the exact point at which the old constraint is removed. |
| R6 | HIGH | Migration correctness | The preflight query compares every reservation pair twice and uses `COALESCE(resourceId, 'default_master')`, while the new constraint operates directly on non-null `resourceId`. The artifact does not specify a backfill/validation step before making the ORM field required, nor whether existing rows get the database default under the generated Prisma SQL. | Specify generated SQL explicitly: add/backfill/validate `resourceId`, enforce NOT NULL, then preflight using `r1.id < r2.id`; test against a restored production-like v1 database. |
| R7 | HIGH | Reschedule token lifecycle | The token payload contains a nonce, but the model stores only one order-level `rescheduleTokenConsumedAt`; no nonce hash, issuance timestamp, active-token identifier, rotation rule, or atomic consume predicate is stored. Multiple links issued before consumption remain independently valid until one succeeds. | Persist a hash of the active nonce/token with expiry and purpose, revoke the previous token on reissue, and consume via one atomic conditional update keyed by order, version, token hash, and `consumedAt IS NULL`. |
| R8 | HIGH | Payment invariant | Late payment after `PAYMENT_EXPIRED` can change the order to `PAID` while leaving the reservation `RELEASED` and requiring manual resolution. The order status alone therefore no longer means the service is booked, and no refund state, deadline, idempotent reconciliation process, or operator ownership/SLA is defined. | Add explicit payment and fulfillment dimensions or a `PAID_REQUIRES_RESOLUTION` state; define automated reconciliation, refund/reschedule outcomes, deadlines, idempotency, and operator runbook. |
| R9 | HIGH | Telegram privacy | The new design masks the phone but still sends free-text `customerNotes` to the staff chat. Redaction is best-effort and may fail; the spec has no retry/reconciliation table for failed edits/deletes, no permission preflight, and no rule for attachments/replies/forwarded copies. | Default to omitting notes from Telegram or provide a minimal safe summary. Track redaction state and retries, alert on permanent failure, verify bot permissions, and state that forwarded/manual copies are outside technical erasure guarantees. |
| R10 | MEDIUM | Telegram message editing | The workflow stores `staffMessageId` and `staffChatId`, but does not specify removal of inline keyboards on terminal transitions or behavior when a message was deleted, migrated, or cannot be edited. Stale buttons can remain actionable unless server-side CAS rejects them. | On every terminal transition, remove reply markup and redact text; treat “message not found/not modified” idempotently; rely on DB CAS rather than UI state; add reconciliation tests. |
| R11 | MEDIUM | Booking lock granularity | T-105 still says “global calendar advisory lock” despite introducing `resourceId`. A truly global lock serializes independent resources and undermines the scale benefit of the resource-scoped GiST constraint. | Key advisory locks by `resourceId` and stable ordering; test simultaneous non-overlapping bookings for different resources. |
| R12 | MEDIUM | Identity / blacklist | E.164 normalization is added, but phone ownership verification, recycled-number handling, Telegram/phone merge precedence, and false-positive unblock/audit policy remain unspecified. | Limit enforcement claims to verified identifiers and define verification, linking, unlinking, appeal, unblock, and audit behavior. |
| R13 | MEDIUM | Cart consistency | T-103 adds positive duration and one currency, but duplicate IDs, inactive/deleted services, price/duration changes between availability and booking, server-side price snapshots, and maximum total duration remain unspecified. | Resolve and lock/snapshot items server-side during booking; reject duplicates unless quantity is modeled; cap total duration; add concurrent catalog-change tests. |
| R14 | MEDIUM | Test traceability | The expanded tests are much better, but there are still no explicit tests for DST/time-zone transitions, simultaneous conflicting staff actions, payment webhook replay, late-payment reconciliation/refund, redaction API failure/retry, multi-resource parallelism, or notification outbox failure. | Add these scenarios and map each FR/NFR to at least one test task and pass criterion. |
| R15 | LOW | Document integrity | The bottom of spec.md contains duplicated legacy `Order`/`SlotReservation` fragments and escaped Markdown (`\---`, `\##`, `\-`). This creates two schema representations and can break automated parsing. The plan still has a blank memory limit. | Remove duplicate fragments, repair Markdown, and fill every numeric placeholder before implementation. |

## Commercial / business plan notes

- Plans loaded: none; only a path/version reference appears in the artifacts.
- Focus laws / SKU floors checked: not verifiable.
- Drift: unresolved, see R2.

## Alternative approaches considered

- Split `OrderStatus`, `PaymentStatus`, `ApprovalStatus`, and `CancellationReason` instead of forcing orthogonal facts into `OrderStatus` plus `ConfirmationStatus`.
- Persist scheduled actions in a database table with due time and generation, using Inngest only as execution transport. This gives a reconciliation source of truth when events are missed.
- Keep free-text notes out of Telegram entirely; show a short safe flag and require authorized access in the application.

## VERDICT

```yaml
verdict: CRITICAL
reviewer: copilot
reviewed_at: 2026-10-19T18:32:56+04:00
commit: unavailable
critical_count: 3
high_count: 6
medium_count: 5
low_count: 1
```

## Snapshot stage

Not executed. The attached files are not a Git worktree, so the repository script and `git rev-parse HEAD` are unavailable. No tag was created.
