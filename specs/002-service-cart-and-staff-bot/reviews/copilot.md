# SpecKit Re-Review: 002-service-cart-and-staff-bot

**Reviewer**: copilot
**Reviewed at**: 2026-10-19T18:32:56+04:00
**Commit**: unavailable (attached artifacts are not a Git worktree)
**Artifacts reviewed**: updated spec.md, plan.md, tasks.md; PostgreSQL 16, Prisma, and Telegram documentation

## Summary

The prior Inngest event-limit defect, legacy `resourceId` backfill omission, open-text Telegram note leakage, and resource-lock granularity issue are fixed. The package remains blocked because required governance sources are absent and the specification now references `ConfirmationStatus` values that do not exist in its own enum, making the declared schema/state machine unimplementable as written. Refund handling and migration operational safety are also still not translated into executable tasks and tests.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| V4-1 | CRITICAL | Schema / state machine | FR-010 requires `ConfirmationStatus = STAFF_REJECTED` and FR-017 requires `ConfirmationStatus = CLIENT_BLOCKED`, but the declared `ConfirmationStatus` enum contains only `PENDING_STAFF_REVIEW`, `STAFF_APPROVED`, `CLIENT_CONFIRMED`, and `RESCHEDULE_OFFERED`. The transition matrix still writes `STAFF_APPROVED` for rejection and blacklisting. The specification therefore has three mutually inconsistent representations of the same transitions. | Add the missing enum values or, preferably, leave approval state unchanged and rely on `OrderStatus=CANCELLED` plus `cancellationReason`. Make FRs, enum, matrix, Prisma task, and tests identical. |
| V4-2 | CRITICAL | Constitution / gate | `.specify/memory/constitution.md` is still absent from the review bundle, although the review contract marks it required. Principle VI/X compliance and the implementation gate cannot be verified. | Supply the constitution and rerun the gate review. |
| V4-3 | CRITICAL | Commercial / GTM | The referenced business plan v18.3 or `business-plan-waiver.md` is still absent. The commercial focus, SKU, price-floor, labor, support, and 14-day-delivery constraints cannot be audited. | Supply the exact business plan or waiver and rerun lens J. |
| V4-4 | HIGH | Payment consistency | US4 still says a late payment with a stolen slot changes the order to plain `PAID`, while the plan, enum, matrix, and T-110b require `PAID_REQUIRES_RESOLUTION` plus `REFUND_REQUESTED`. This is a direct acceptance-test contradiction. | Change US4 to `PAID_REQUIRES_RESOLUTION`, `refundStatus=REFUND_REQUESTED`, reservation `RELEASED`, and define the exact operator resolution outcomes. |
| V4-5 | HIGH | Refund implementation | FR-022 adds a refund state machine, provider-side action, PaymentEvent record, and 24-hour SLA, but no task implements the refund mutation, provider call, idempotency key, authorization, retry/reconciliation, or SLA escalation. No test covers duplicate refund commands or provider ambiguity. | Add dedicated implementation and test tasks for refund request, provider execution, idempotent completion, failed/unknown outcome reconciliation, operator authorization, and overdue alerting. |
| V4-6 | HIGH | Migration availability | The backfill sequence is now explicit, but all DDL, full-table update, exclusion-index build, and old-constraint drop still appear as one migration governed by a 5-second statement timeout. The artifacts do not state whether each statement is in one transaction, how retries work, what table size was benchmarked, or what maintenance fallback applies. PostgreSQL exclusion constraints require an index-backed constraint, so cutover cost must be measured rather than assumed. | Split additive/backfill/cutover where the migration runner permits; benchmark a production-like table; define transaction boundaries, retry/backoff, deploy abort criteria, and maintenance fallback. |
| V4-7 | HIGH | Legacy data correctness | `totalDurationMin Int @default(0)` is added, but no backfill derives the actual duration of existing reservations. Legacy active reservations can consequently carry a false zero duration even though `startTime/endTime` define a nonzero interval. | Backfill from the authoritative interval or linked item duration, add a positive-value check for active rows, and test a restored v1 dataset. |
| V4-8 | HIGH | Staff action concurrency | The plan says the inline keyboard is removed “при любом действии мастера” to exclude races, but UI removal is not a transactional lock. Two callbacks can arrive before either edit completes; if markup removal succeeds and the business mutation fails, controls disappear while the order remains actionable. Tasks do not require compare-and-set transitions for staff actions. | Make every action a transactional CAS from an allowed state, deduplicate callback/action IDs, commit the state first, then update Telegram as a retryable projection. Test simultaneous approve/reject/blacklist/fulfill callbacks. |
| V4-9 | MEDIUM | Reschedule concurrency | Hash storage is fixed, but issuance and consumption are still described as ordinary assignments rather than atomic conditional updates. Concurrent token issuance can overwrite the active hash; concurrent consumption must test version, hash, expiry, and `consumedAt IS NULL` in one write. | Specify CAS issuance/consumption and add concurrent issue/use tests. |
| V4-10 | MEDIUM | Telegram redaction | Permanent “message not found/deleted” errors are defined as terminal no-op, but permission loss, rate limiting, malformed markup, and “message not modified” are not classified. The compliance text still says purge clears “traces in messengers,” which cannot cover forwarded or manually copied content. | Add an explicit error taxonomy and reconciliation status; narrow the compliance claim to bot-owned stored message references and explicitly exclude forwarded/manual copies. |
| V4-11 | MEDIUM | Cart consistency | Cart validation still omits duplicate IDs, inactive/deleted items, price/duration changes between slots and lock, immutable OrderItem price/duration snapshots, and a maximum total appointment duration. | Resolve items server-side in the booking transaction, reject duplicates unless quantity exists, snapshot commercial fields, cap total duration, and test concurrent catalog mutation. |
| V4-12 | MEDIUM | Identity / blacklist | E.164 normalization is specified, but phone ownership verification, Telegram/phone linking precedence, recycled numbers, false-positive appeals, and unblock audit data remain undefined. | Restrict enforcement to verified identifiers or document the limitation; define linking, appeal, unblock actor/reason, and retention. |
| V4-13 | MEDIUM | Test traceability | The tasks still omit enum/schema consistency, refund lifecycle, simultaneous staff callbacks, DST boundaries, duplicate payment webhooks, migration from real v1 data, multi-resource parallelism, permanent Telegram failures, and catalog mutation during checkout. | Add explicit tasks and map each FR/NFR/state transition to a test and pass criterion. |
| V4-14 | LOW | Cross-document terminology | US2 still says the card includes “пожелания,” while FR-008 and the plan say only `[Есть примечания]` plus a protected admin link. | Make the user story match the zero-leak requirement exactly. |

## Commercial / business plan notes

- Plans loaded: none; only the v18.3 reference was available.
- Focus laws / SKU floors checked: not verifiable.
- Drift: unresolved, see V4-3.

## Alternative approaches considered

- Keep `ConfirmationStatus` limited to confirmation facts and represent all terminal outcomes only through `OrderStatus` plus `CancellationReason`.
- Model refunds in a separate `Refund`/`PaymentOperation` entity rather than a three-value field on `Order`, allowing multiple attempts and provider reconciliation without overwriting history.
- Treat Telegram cards as projections: database transition first, then idempotent message edit/removal through the outbox.

## VERDICT

```yaml
verdict: CRITICAL
reviewer: copilot
reviewed_at: 2026-10-19T18:32:56+04:00
commit: unavailable
critical_count: 3
high_count: 5
medium_count: 5
low_count: 1
```

## Snapshot stage

Not executed. The supplied attachments are not a Git worktree, so `git rev-parse HEAD` and the snapshot-stage script are unavailable. No tag was created.
