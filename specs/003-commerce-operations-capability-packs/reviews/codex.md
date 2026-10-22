# SpecKit Review: 003-commerce-operations-capability-packs

**Reviewer**: codex  
**Reviewed at**: 2026-10-22T00:16:08+04:00  
**Commit**: 3379b57e0b0ea5411991179db24bdcfb7f769f75  
**Artifacts reviewed**: spec.md, plan.md, tasks.md, data_model.md, contracts.md, quickstart.md, research.md, checklist.md, .specify/memory/constitution.md, undreplans/docs/projects/undreseller/undreseller-business-plan.md v18.3, prisma/schema.prisma, existing reviews/analyze.md and reviews/copilot.md

## Summary

The artifacts define useful transactional invariants, privacy boundaries, and recovery targets. However, the claimed Sprint B scope exceeds the business plan’s fixed offer, AMD is seeded with the wrong ISO minor unit, and the post-contract rollback path can read stale legacy data. These blockers should be resolved before implementation.

**Gate status**: reviews/analyze.md reports PASS. The existing reviews/copilot.md ends with MEDIUM and PASS_WITH_MINOR_IMPROVEMENTS, neither of which is an accepted constitution verdict (PASS or OVERRIDDEN). This review is CRITICAL, so the implementation gate is not satisfied.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | CRITICAL | Commercial/GTM | The feature calls 003.1 a Sprint B deliverable at $4,900 / 14 days and makes it blocking (spec.md:25-44; plan.md:16-23). The business plan limits Sprint B to 2 roles, 1 key process, and 1 external API (undreplans/docs/projects/undreseller/undreseller-business-plan.md:215-224), while the MVP requires 3 roles and goods, service booking, mixed fulfillment, payment/refund flows, and an operator queue (spec.md:158-225), and wires Telegram Stars plus NOWPayments (tasks.md:97-103). The business plan promises subscription billing, but the feature excludes recurring subscription engines (business plan:215-223; spec.md:103). | Narrow the MVP to the paid offer’s fixed boundary, or formally reprice/rescope the offer and update the business plan before describing 003.1 as Sprint B. |
| F2 | CRITICAL | Financial correctness | The backfill seeds AMD with minorUnit = 0 (data_model.md:574-577), while the currency requirement delegates scaling to CurrencyMetadata (spec.md:345). SIX, the ISO 4217 Maintenance Agency, lists AMD with minor unit 2 in its [official amendment](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/amendments/dl_currency_iso_amendment_78.pdf). This can mis-scale Armenian dram prices and payment amounts by 100x. | Use AMD minorUnit = 2 from the maintained ISO 4217 data; keep any processor-specific amount convention separate and test conversions. |
| F3 | CRITICAL | Migration / rollback | Stage 1 dual-writes legacy and new tables, but Stage 4 retires those shims (plan.md:170-174; data_model.md:587-590). The rollback procedure later switches reads back to legacy tables (plan.md:192), even though the data-model note says its down migrations only drop additive objects when rolled back before Contract (data_model.md:590). Post-contract writes can therefore be absent from the legacy read path, causing a rollback to hide accepted orders, payments, or fulfillment changes. T057 also contracts before T058/T059 run the load and DR checks (tasks.md:203-208). | Keep reverse compatibility through a defined rollback window, or specify and test a post-contract recovery that synchronizes new writes before switching reads to legacy storage. Gate Contract on the production observation and recovery criteria. |
| F4 | HIGH | Migration / legacy data | Backfill derives Party from MessengerContact and historical Order customer fields, then Stage 3 requires every Order.partyId to be non-null (data_model.md:579-584). The current Order schema allows customerName, customerPhone, customerEmail, customerTgId, and customerTgUsername all to be null (prisma/schema.prisma:185-192), and no fallback mapping is specified. Such historical orders can prevent validation/cutover. | Define a deterministic legacy/anonymous Party mapping or a documented nullable exception and repair path; test it against orders with no customer identifiers. |
| F5 | HIGH | Authentication | FR-325b requires a maintained authentication library (spec.md:386-391), but the plan selects native crypto scrypt and describes custom StaffSession cookie/DB handling (plan.md:21,30; tasks.md:44). The prior 001 spec explicitly prohibits implementing password hashing or session-cookie cryptography from scratch and names a maintained auth library as the preferred evaluation target (specs/001-modular-commerce-template/spec.md:81-93). | Select and specify the maintained auth library and its invite, bootstrap, revocation, and audit contract before implementation, or formally amend the requirement and upstream planning artifacts. |
| F6 | HIGH | Requirements coverage / privacy | FR-304 requires Consent in the MVP Party model (spec.md:348), but the Party schema and Stage 1 migration omit it (data_model.md:85-171,569), as do the Party service and DDL task (tasks.md:41,45). The compliance readiness checklist also requires privacy/consent approval (spec.md:458-459), but there is no consent capture or enforcement path. | Add the Consent model, migration/backfill behavior, channel eligibility checks, and acceptance tests, or remove Consent from the MVP requirement and adjust the readiness gate. |
| F7 | HIGH | Release sequencing | The plan labels US6-US11 as later independent/non-blocking phases (plan.md:19; spec.md:45-50,299-305), but the dependency graph makes MVP gate T062 depend on deferred-pack tests T038, T042, T045, T048, T052 and AI Lab test T056 (tasks.md:267). Tier 1 therefore cannot pass its final gate without Tier 2 and Phase H. | Split the release gates and dependency graph so 003.1 requires only Tier 1 tasks; keep deferred-pack and AI Lab checks in their own releases. |
| F8 | HIGH | Commercial / demand gate | The business plan blocks public Sprint A/B offers and starts of large sprints until 10 paid Tripwire audits are closed (undreplans/docs/projects/undreseller/undreseller-business-plan.md:202). The feature explicitly makes 003.1 blocking for Sprint B (spec.md:34-44), but none of the reviewed artifacts records that the demand gate has been met or makes it a pre-implementation decision gate. | Add a verified demand-gate checkpoint before Sprint B implementation, with evidence of the 10 paid audits, or keep the Sprint B work blocked. |
| F9 | MEDIUM | Artifact consistency | The plan/task index refers to data-model.md, contracts/api-contracts.md, and checklists/requirements.md (plan.md:71-84; tasks.md:7-8), but the repository contains data_model.md, contracts.md, and checklist.md. The content exists, but the documented paths will fail for readers and automation. | Normalize the references to the actual artifact paths, or rename the artifacts consistently. |

## Commercial / business plan notes

- Plans loaded: undreplans/docs/projects/undreseller/undreseller-business-plan.md v18.3 (undreplans main commit 542a05f7bd18a31a3696ee6d2d9afe6b30ab2bd2).
- Focus laws checked: Sprint B 2-role / 1-process / 1-integration limit; 10-paid-Tripwire demand gate; Phase A product boundary.
- Drift: see F1 and F8.

## Alternative approaches considered

For the MVP, either reduce delivery to one process and one external integration inside the priced Sprint B boundary, or explicitly update the commercial offer and price before implementation. For the migration, evaluate a compatibility/read-adapter phase that keeps legacy data authoritative until reconciliation and rollback conditions are satisfied.

## VERDICT

```yaml
verdict: CRITICAL
reviewer: codex
reviewed_at: 2026-10-22T00:16:08+04:00
commit: 3379b57e0b0ea5411991179db24bdcfb7f769f75
critical_count: 3
high_count: 5
medium_count: 1
low_count: 0
```
