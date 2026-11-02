# SpecKit Review: 007-code-review-fixes

**Reviewer**: antigravity  
**Reviewed at**: 2026-11-02T05:05:00Z  
**Commit**: 44addf7c97a966c7ca46da64bf04eda1a65e3ee0  
**Artifacts reviewed**: spec.md (rev 1.2), plan.md, tasks.md, research.md, requirements-audit.md, business-plan-waiver.md, qa/ (preliminary-rtm, rtm-matrix, test-cases 24 TC, uat-scenarios, regression-suite), reviews/analyze.md (re-run #2 PASS), `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v20.1)

## Summary

Повторный аудит после ремедиации спеки (rev 1.2) и сопутствующих артефактов (plan.md, tasks.md, research.md, test-cases.md): все шесть ранее обнаруженных дефектов (F1–F6) полностью устранены на уровне спецификации, архитектурного плана и задач. Платёжный инвариант суммы стал provider-aware (Telegram Stars с валютой `XTR` и расчётом звёзд изолирован от фиата, в Stripe устранена захардкоженная валюта `USD`); реестр локаута защищён от спрея по несуществующим адресам (`userExists` guard) с аварийным вытеснением по `min(lockedUntil)` при переполнении 1000 записей; сравнение `timingSafeEqual` защищено по байтовой длине буферов; таймаут WhatsApp прерывает повторы; типизирована ошибка `RESCHEDULE_SECRET_UNCONFIGURED`; отправляется алерт-ответ Telegram callback query при 503. Все требования специфицированы строго, консистентно и готовы к опрессовке в коде.

## Findings

| ID | Severity | Area | Finding | Recommendation |
| --- | --- | --- | --- | --- |
| F1 | RESOLVED | Money Path / Data Integrity | Закрыто: инвариант `fulfillPayment` в spec.md US3/FR-704, plan.md, research D2 и tasks T013 стал provider-aware. Telegram Stars сверяет `currency === 'XTR'` и `amountMinor === (order.starsPrice ?? Math.round(order.totalMinor / 2))`; Stripe/Crypto сверяют фиат заказа; в Stripe webhook валюта передаётся из сессии (`parsed.currency`). Добавлены TC-007-010a и TC-007-010b. | Реализовать в T013 строго по спеке. |
| F2 | RESOLVED | Security / DoS & Memory | Закрыто: `userExists` guard исключает мусорный спрей по несуществующим email; при аварийном заполнении 1000 активных локов вытесняется запись с `min(lockedUntil)`. Потолок 1000 записей и бюджет ≤500 MB RSS гарантированы. | Реализовать в T015 строго по спеке. |
| F3 | RESOLVED | Security / Robustness | Закрыто: в FR-707, T016 и TC-007-018 зафиксировано сравнение `bufA.length === bufB.length` на созданных UTF-8 буферах до `timingSafeEqual`, исключая `RangeError` на multi-byte символах. | Реализовать в T016. |
| F4 | RESOLVED | Reliability / Latency Budget | Закрыто: в FR-705, US4, T014 и TC-007-012 зафиксировано, что сетевой таймаут `AbortError`/`TimeoutError` немедленно завершает retry-цикл WhatsApp client, укладываясь в ≤10.5 с. | Реализовать в T014. |
| F5 | RESOLVED | Error Handling / API Contract | Закрыто: в FR-701 и T010 типизирована ошибка `RESCHEDULE_SECRET_UNCONFIGURED` для `verifyMagicRescheduleToken`. | Реализовать в T010. |
| F6 | RESOLVED | UX / Telegram Protocol | Закрыто: в FR-701 и T010 при неконфигурированном секрете предусмотрена отправка `answerCallbackQuery` с текстом ошибки до возврата 503, снимая вечные часики у оператора. | Реализовать в T010. |

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v20.1.
- Focus laws / SKU floors checked: чистый tech-debt / security hardening. Никаких новых SKU, изменений ценовой лестницы ($4,900 / $6,800), тарифов Care ($149 / $349) или нарушения лимита бизнес-интеграций (≤1) нет.
- Drift: отсутствует. В `specs/007-code-review-fixes/business-plan-waiver.md` оформлен корректный вейвер по Principle VII-B.5.

## Alternative approaches considered

- Все альтернативы исследованы и зафиксированы в `research.md` (D1–D6) — 0 спайков, 100% канонические stdlib/FSM решения.

## VERDICT

```yaml
verdict: PASS
reviewer: antigravity
reviewed_at: 2026-11-02T05:05:00Z
commit: 44addf7c97a966c7ca46da64bf04eda1a65e3ee0
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

**GATE UNLOCKED (Principle VI)**: Все замечания F1–F6 полностью закрыты в спецификации и плане. Вердикт изменён с `CRITICAL` на **`PASS`**. Артефакты готовы к переходу на этап реализации (`/speckit.implement`).
