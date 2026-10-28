# SpecKit Review: 005 (005-stripe-adapter-and-sovereign-auth)

**Reviewer**: antigravity
**Reviewed at**: 2026-10-26T00:30:00Z (re-run после remediation)
**Commit**: 9943b3dc6ce1bda1e2087190e2cdc0fc662598b1
**Artifacts reviewed**: spec.md (rev 2.3), plan.md, tasks.md, data-model.md, contracts/stripe-adapter.md, quickstart.md, research.md, requirements-audit.md, qa/ (rtm-matrix.md, test-cases.md, uat-scenarios.md, regression-suite.md, preliminary-rtm.md), undreplans/docs/projects/undreseller/undreseller-business-plan.md (v18.8), .specify/memory/constitution.md (v1.8.0)

## Summary

Feature 005 builds a solid foundation for fiat checkout and sovereign auth hardening, correctly rejecting microservices, SaaS auth clouds, and parallel billing tables. All 9 findings (F1–F9) from the initial critical audit have been completely resolved across the feature artifacts (`spec.md` rev 2.3, `data-model.md`, `contracts/stripe-adapter.md`, `plan.md`, and `tasks.md`): `RefundOperationKind` is augmented with `STRIPE` in the Expand migration, `app/api/checkout/route.ts` is fully integrated into the implementation tasks, webhook deduplication and FSM transitions are bound to an atomic transaction, `PaymentAllocationLink` canonical ID is locked to `pi_...`, orphan model cleanup excises dangling relations on `Order`, the Argon2 mutex is bounded by queue and timeout limits, rate limiting supports two-tier failure penalties, the stale 30m TTL residue is fixed to 15m, and customer return routing is specified to prevent 404s.

## Findings

| ID  | Severity | Area | Finding | Recommendation / Resolution Status |
| --- | -------- | ---- | ------- | ---------------------------------- |
| F1  | ~~CRITICAL~~ RESOLVED | Data Architecture & Expand/Contract | `RefundOperation.kind` PostgreSQL enum `RefundOperationKind` lacked `STRIPE`, leading to fatal runtime validation errors on Stripe refunds and overbooking collisions. | **Закрыто в rev 2.3**: `enum RefundOperationKind` в `schema.prisma` расширен членом `STRIPE`; `ALTER TYPE "RefundOperationKind" ADD VALUE 'STRIPE';` включён в Expand-миграцию `20261101000000_005_stripe_and_hardening/migration.sql` (T010, `data-model.md` §3); в `data-model.md` и `plan.md` задокументирован no-op для enum в `down.sql`; `fulfillment.ts:176-179` предписано использовать `STRIPE` для овербукинга. |
| F2  | ~~HIGH~~ RESOLVED | Architecture Execution & Scope | Omission of `app/api/checkout/route.ts` from plan and tasks left hardcoded `NOWPAYMENTS` constraints and prevented the Stripe factory from registering in the checkout route. | **Закрыто в rev 2.3**: `app/api/checkout/route.ts` включён в `plan.md` (§Project Structure) и T030 (`tasks.md`); специфицированы side-effect импорт `@/lib/payments/stripe`, расширение `checkoutSchema.paymentMethod` (`STRIPE`/`CARD`), и динамическая диспетчеризация `createInvoice` по выбранному клиентом провайдеру. |
| F3  | ~~HIGH~~ RESOLVED | Reliability & Failure Modes | Webhook replay trap in `InboxEvent` deduplication: separating `InboxEvent.create` from the FSM transaction swallowed retries on transient fulfillment failures, permanently stranding paid orders. | **Закрыто в rev 2.3**: `spec.md` §3, `contracts/stripe-adapter.md` §3 и T031 зафиксировали обязательное выполнение дедупликации `InboxEvent` и FSM-переходов строго внутри единой атомарной транзакции `prisma.$transaction(async (tx) => { ... })` (либо проверка `status === 'PROCESSED'` на реплее P2002). |
| F4  | ~~MEDIUM~~ RESOLVED | API Contracts & Data Flow | `PaymentAllocationLink` identifier ambiguity between `cs_...` and `pi_...` caused `charge.refunded` lookups (which only have `pi_...`) to fail if `cs_...` was saved. | **Закрыто в rev 2.3**: `spec.md:82,95`, `contracts/stripe-adapter.md:13,44`, `data-model.md:43` и T030 зафиксировали, что `parseCallback` для `checkout.session.completed` обязан сохранять в качестве канонического `providerPaymentId` идентификатор PaymentIntent (`session.payment_intent`, `pi_...`). |
| F5  | ~~MEDIUM~~ RESOLVED | Data Architecture & Hygiene | Orphan models cleanup in T070 left dangling relations (`orderLines`, `paymentPlan`, `fulfillmentPlan`) on `model Order`, causing `prisma generate` to fail. | **Закрыто в rev 2.3**: `spec.md` FR-550, `data-model.md` §1.6 и T070 явно специфицируют удаление полей `orderLines OrderLine[]`, `paymentPlan PaymentPlan?`, `fulfillmentPlan FulfillmentPlan?` из `model Order` в `prisma/schema.prisma`. |
| F6  | ~~MEDIUM~~ RESOLVED | Performance & DoS Surface | Argon2 in-process mutex queue was unbounded, causing Head-of-Line blocking and potential memory bloat/timeouts under concurrent logins. | **Закрыто в rev 2.3**: `spec.md` FR-504a, `plan.md` §Performance/STRIDE и T012 зафиксировали максимальную глубину очереди ожидания мьютекса (≤10) и таймаут ожидания (5000мс), с немедленным возвратом HTTP 503 / 429 (`Service Busy`) при переполнении. |
| F7  | ~~MEDIUM~~ RESOLVED | Security & Logic Alignment | Multi-tier lockout discrepancy: existing `enforceRateLimit` could not support a 15-minute failure observation window coupled with a 30-minute block duration for FR-503. | **Закрыто в rev 2.3**: `spec.md` FR-503, `plan.md` §Source и T021 специфицируют добавление специализированных функций штрафного трекинга (`recordAuthFailure` и `isIpLockedOut`) в `lib/security/rateLimit.ts`. |
| F8  | ~~LOW~~ RESOLVED | Editorial Consistency | Residual 30-minute TTL text in `spec.md` §3 line 94 contradicted the 15-minute prepaid hold TTL. | **Закрыто в rev 2.3**: `spec.md` §3 строка 94 исправлена на 15 мин, достигнута 100% внутренняя согласованность. |
| F9  | ~~LOW~~ RESOLVED | Stakeholder UX & Redirect Flow | Undefined `success_url` / `cancel_url` and risk of `notFound()` (404) in `app/checkout/page.tsx` when returning from Stripe. | **Закрыто в rev 2.3**: `contracts/stripe-adapter.md` §2, `spec.md` FR-511 и T034 зафиксировали точные URL возврата (`${baseUrl}/checkout?orderId=...`) и обновление `app/checkout/page.tsx` для отображения подтверждения бронирования при статусе `PAID`/`BOOKED`. |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.8, 2026-10-26).
- Focus laws / SKU floors checked: Sprint B $4,900 floor intact; Ladder Protection Law enforced; Stripe qualified as Infrastructure Adapter (does not consume the "≤1 business integration" limit); subscriptions and recurring billing strictly prohibited (`mode: "payment"`); Demand Gate (10 Tripwires) unaffected; zero cold paid acquisition or brand bleed.
- Drift: None. The commercial strategy aligns with the core canon.

## Alternative approaches considered

- **Atomic Transaction Webhook Ingestion vs Staged Inbox Polling**: Atomic transaction approach adopted in `spec.md` §3 and T031, guaranteeing zero swallowed payment events on webhook retries.
- **Unified Provider Dispatch**: Integrated into `app/api/checkout/route.ts` via dynamic provider lookup from `providerContract.ts` in T030.

## Metrics & Health

- Total Requirements: 28 (23 FR + 5 NFR)
- Total Tasks: 29 (counts, agent summaries, and dependency graph verified: 0 cycles, 0 orphans)
- Coverage: 100% (28/28 requirements mapped to tasks)
- CRITICAL count: 0 (1 resolved)
- HIGH count: 0 (2 resolved)
- MEDIUM count: 0 (4 resolved)
- LOW count: 0 (2 resolved)

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-10-26T00:30:00Z
commit: 9943b3dc6ce1bda1e2087190e2cdc0fc662598b1
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```
