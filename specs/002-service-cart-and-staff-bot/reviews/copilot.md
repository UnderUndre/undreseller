# SpecKit Review: 002-service-cart-and-staff-bot

**Reviewer**: copilot  
**Reviewed at**: 2026-10-19T18:32:56+04:00  
**Commit**: unavailable (attached artifacts are not a Git worktree)  
**Artifacts reviewed**: spec.md, plan.md, tasks.md, architecture.md, requirements.md; public primary documentation for PostgreSQL, Telegram Bot API, Inngest, NOWPayments, and GDPR data-minimisation guidance

## Summary

The business flow is intelligible, but the package is not implementation-safe. The blocking defects are: required governance artifacts were not available; the exclusion-constraint replacement is described as “Expand / Contract” although it is a one-step destructive constraint swap; lifecycle/payment states are internally incomplete; and delayed Inngest jobs have no cancellation/versioning model after reschedule, rejection, payment, or manual confirmation. The feature should not enter implementation until these invariants are made explicit and covered by migration, concurrency, replay, and failure tests.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | CRITICAL | Constitution / gate | `.specify/memory/constitution.md` was not supplied, although the review contract marks it REQUIRED. Principle-level compliance, including the exact implementation gate and migration rules, cannot be verified. | Add the constitution to the review bundle and rerun this review. Treat the present verdict as blocking rather than interpreting missing evidence as compliance. |
| F2 | CRITICAL | Commercial / GTM | The referenced business plan v18.3 was not supplied and no `business-plan-waiver.md` was supplied. The feature changes monetized checkout, payment timing, operator labor, messaging channels, and a hero workflow, so lens J cannot be completed. | Supply the exact v18.3 business plan artifact or a valid waiver. Trace pay-on-site, delayed invoicing, support burden, channel costs, and the 14-day delivery promise to explicit plan clauses. |
| F3 | CRITICAL | Migration / zero downtime | `plan.md` calls the migration Expand/Contract, but it drops/replaces `slot_no_overlap` in one migration. Replacing an exclusion constraint requires table-level DDL and exposes a window in which the old and new application semantics cannot both be valid. `down.sql` cannot safely restore the item-scoped rule if global-calendar data accumulated that was valid under the new model but invalid under the old deployment semantics. | Specify a multi-deploy compatibility protocol: lock timeout, preflight conflict query, maintenance/traffic-drain decision, new constraint creation/validation strategy, application feature flag, rollback compatibility window, and abort criteria. Do not label a one-step replacement Expand/Contract. |
| F4 | CRITICAL | State machine / payments | The spec uses `Order` statuses (`PENDING`, `CANCELLED`, `CANCELLED_BLOCKED`, `CANCELLED_NO_SHOW`, `FULFILLED`, paid states) and a separate `ConfirmationStatus`, but no legal transition table or cross-field invariants exist. `AFTER_STAFF_APPROVAL` says an invoice has a 15-minute timer, yet no expiry transition, late-payment behavior, slot-release rule, refund/manual-resolution rule, or idempotency key is defined. Tasks T-101–T-115 omit the FULFILLED staff action and the delayed-invoice expiry lifecycle. | Add an authoritative state machine with guarded transitions, terminal states, payment/booking consistency invariants, and race outcomes. Add tasks and tests for invoice creation, expiry, late webhook, duplicate webhook, rejection after payment, reschedule after payment, and fulfillment. |
| F5 | HIGH | Durable jobs | T-108/T-110 schedule sleeping reminder and auto-cancel jobs, but there is no `cancelOn`, generation/version token, or final-state compare-and-set for cancellation/reschedule/rebooking. A stale sleeping run may message or cancel an order after the appointment was moved, rejected, paid, confirmed, or fulfilled. Inngest documents that sleeping runs continue unless canceled and that cancellation does not undo an already executing step. | Correlate each run to `orderId + scheduleVersion`; cancel on every terminal/reschedule event; after wake, re-read the order and perform a conditional transition inside one DB transaction. Add race tests at the wake-up boundary. |
| F6 | HIGH | Authorization | `staffChatId` is used both as a destination chat and as `ctx.from.id` authorization. Telegram chat IDs and user IDs are different principals, especially in groups. The spec also says “whitelist” but models only one nullable string. Forwarded/shared buttons and membership changes are undefined. | Model `staffDestinationChatId` separately from `authorizedStaffUserIds`. Require both expected chat context and authorized actor, define group/private-chat policy, and audit actor user ID. |
| F7 | HIGH | Magic link security | FR-011 requires a one-time link, while the plan only defines deterministic `HMAC(orderId, secret)`. That token is reusable, has no expiry, is not bound to the current cart/schedule version or intended recipient, and has no consumed/revoked state. | Use a random single-use token stored as a hash with order ID, purpose, expiry, schedule version, consumed timestamp, and revocation. If stateless signing is retained, include nonce, expiry, audience, and version, then persist consumption. |
| F8 | HIGH | Privacy / trust boundary | The Staff-bot card sends contacts and free-text `customerNotes` to Telegram, while the compliance section says notes are encrypted or isolated and excluded from logging. There is no minimisation rule, lawful-basis/notice requirement, Telegram retention/deletion procedure, bot-message purge, or rule preventing medical/health details from being entered and copied to Telegram. Database nullification after 30 days does not delete copies from Telegram chats. | Minimise the card by default; do not send free-text notes or full contact data unless demonstrably necessary. Add privacy notice/lawful basis, sensitive-data warning, access policy, message-deletion/retention procedure, and DPIA trigger for medical deployments. |
| F9 | HIGH | Identity / blacklist | “New client” and blacklist enforcement rely on Telegram ID or user-supplied phone, but identity precedence, normalization, verification, collision handling, and cross-channel linking are unspecified. A user can omit/change a phone; recycled numbers can punish a different person; concurrent bookings can both observe zero completed visits. | Define canonical identity rules, E.164 normalization and verification, merge/unmerge policy, false-positive appeal/unblock audit, and a transactional snapshot for `autoCancelOnNoConfirmation`. Do not claim abuse prevention beyond verified identifiers. |
| F10 | HIGH | Requirements consistency | US1’s acceptance text says the 10:30 window “отображается” and immediately says it conflicts with 11:30–12:30 and therefore is hidden. This produces two opposite expected results for the same fixture. Several numeric placeholders are also missing in rendered text (`за часов`, `имеющие минут`, NFR memory/RTO in system requirements). | Correct the contradictory expected result and replace every missing numeric placeholder. Add a machine-checkable example table with timezone, interval boundary convention `[start,end)`, breaks, DST cases, and expected slots. |
| F11 | HIGH | Test coverage | T-114 lists only four unit-test themes. It does not cover the 50 ms p95 target, 500 MB ceiling, 1.5 s delivery SLA, DDL lock behavior, down migration, DST, webhook replay, stale callbacks, payment races, message-delivery failure, GDPR purge, or cross-channel identity. T-115’s generic commands are not evidence for these properties. | Add dedicated integration, property, load, migration, and fault-injection tasks with explicit datasets and pass/fail thresholds. Include real PostgreSQL exclusion tests rather than mocked ORM tests. |
| F12 | HIGH | Delivery semantics / failure modes | NFR-002 says the Staff notification is delivered within 1.5 seconds, while the edge-case design routes delivery through a durable queue. Enqueue/commit latency is controllable; Telegram delivery is an external dependency and cannot be guaranteed as worded. No operator fallback exists when Telegram is unavailable long enough for approval deadlines. | Split metrics into “outbox committed,” “send attempted,” and “provider acknowledged.” Define retry horizon, dead-letter alert, admin-dashboard fallback, and what happens to the booking/payment timer while approval delivery is unavailable. |
| F13 | MEDIUM | API semantics | A blacklist rejection is specified as HTTP 403, which leaks that an identifier is blocked and makes account/phone probing easier. Rate limiting is in-memory and keyed behavior is not defined for spoofable phone/TG input. | Document the disclosure tradeoff; consider a generic booking rejection externally while recording the precise reason internally. Define limiter keys, proxy/IP trust, and per-identity plus per-IP controls. |
| F14 | MEDIUM | Cart invariants | The cart accepts `itemIds`, but duplicate IDs, inactive/deleted items, price/duration changes between slot query and lock, zero/negative durations, mixed currencies, ordering, quantity, and maximum total duration are unspecified. | Resolve all items server-side inside the booking transaction, reject duplicates unless quantity is explicit, snapshot price/duration into `OrderItem`, validate positive bounded duration and one currency, and cap total appointment length. |
| F15 | MEDIUM | Calendar model | The global constraint assumes exactly one resource/master forever. Yet the prose alternates between “calendar” and “master,” and target businesses can have multiple staff/resources. A global range with no resource key prevents all simultaneous bookings, even for different staff. | State the v1 invariant “exactly one bookable resource” explicitly and test it. If multiple staff is foreseeable, use a `resourceId` dimension in the exclusion constraint rather than another destructive migration later. |
| F16 | MEDIUM | Callback replay / idempotency | “Block repeat button presses” is a UI effect, not a concurrency invariant. Two callbacks, retries, or distinct staff actions can race. No conditional update predicate, callback nonce, or conflict response is specified. | Implement each action as a DB compare-and-set from allowed source states, deduplicate by action/event ID, and return the already-applied result. Test conflicting simultaneous Approve/Reject/Blacklist actions. |
| F17 | MEDIUM | Operational readiness | The feature adds a second bot, delayed workflows, external templates, and more PII, but tasks add no health probes, alert thresholds, dashboards, runbook updates, backup/restore verification for new fields, or reconciliation job for stuck approval/payment states. | Add ORR tasks: bot webhook registration check, queue age and failed-run alerts, stale-order reconciliation, template readiness, runbook, rollback drill, and restore validation. |
| F18 | LOW | HTTP / UX contract | `403 Forbidden ("Access restricted")`, late-confirmation UX, reschedule errors, and payment-expiry responses are described informally, with no versioned API contract or error schema. | Add contracts for request/response bodies, stable error codes, localization, and retryability. |

## Commercial / business plan notes

- Plans loaded: none; only references to `undreseller-business-plan.md v18.3` were present.
- Focus laws / SKU floors checked: not verifiable without the referenced plan.
- Drift: unresolved; see F2 and F4.

## Alternative approaches considered

1. **Persisted scheduler table plus poller instead of one long sleep per booking.** This makes reschedule/cancel semantics explicit and supports reconciliation, at the cost of a polling worker. It is worth comparing against Inngest sleeping runs because the feature has mutable appointment times.
2. **Separate booking state, approval state, and payment state machines.** This avoids encoding unrelated dimensions in one status field and permits explicit cross-state invariants.
3. **Outbox for all outbound provider messages.** A single transactional outbox with provider-specific delivery records gives measurable enqueue/attempt/ack states and supports replay without duplicating business transitions.
4. **Resource-scoped calendar constraint.** Even if v1 has one master, `resourceId WITH =, tstzrange(...) WITH &&` avoids baking a global-calendar dead end into the schema.

## Evidence notes

- PostgreSQL documents that table-level locks can conflict with ordinary reads; DDL planning must account for lock acquisition and queued traffic. PostgreSQL also documents exclusion constraints as database-enforced constraints.
- Telegram’s Bot API supports webhook secret-token verification, but destination chat identity and callback actor identity remain distinct fields that the application must authorize correctly.
- Inngest documents durable sleeps, resumption, and cancellation boundaries; completed/executing side effects are not rolled back by cancellation.
- NOWPayments documents alphabetical key sorting plus HMAC-SHA512 comparison for IPN verification and requires a prompt endpoint response.
- GDPR data-minimisation guidance requires personal data to be adequate, relevant, and limited to what is necessary; copying free-text notes and full contacts into a third-party chat needs an explicit necessity and retention design.

## VERDICT

```yaml
verdict: CRITICAL
reviewer: copilot
reviewed_at: 2026-10-19T18:32:56+04:00
commit: unavailable
critical_count: 4
high_count: 8
medium_count: 5
low_count: 1
```

## Snapshot stage

Not executed. The supplied artifacts were attachments rather than a Git worktree, so `.specify/scripts/bash/snapshot-stage.sh review 002-service-cart-and-staff-bot` and `git rev-parse HEAD` were unavailable. No tag was created.
