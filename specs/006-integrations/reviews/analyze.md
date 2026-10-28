# SpecKit Analyze: 006-integrations (006-google-calendar-and-integrations)

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-10-26T00:00:00Z (**re-run #3** — после фиксов X1–X8 из re-run #2)
**Commit**: ea2b1be98f8af880b1fdfb316c81ba4a3e526289 (артефакты 006 в working tree)
**Artifacts**: spec.md (rev 1.2), plan.md, tasks.md, data-model.md, contracts/gcal-adapter.md, contracts/outbound-webhooks.md, quickstart.md, requirements-audit.md, qa/ (rtm-matrix, test-cases 46 TC, uat-scenarios, regression-suite, preliminary-rtm), reviews/antigravity.md (PASS), reviews/analyze.md (re-run #2: FAIL → фиксы применены)
**Feature resolution**: check-prerequisites резолвит по ветке (`004-release-readiness`, IX-девиация) — анализ явно по `specs/006-integrations/`.

## Context of re-runs

- **Re-run #1**: PASS с 6 находками (2 MEDIUM + 4 LOW) → все закрыты в тот же день.
- **Внешнее ревью antigravity**: PASS, F1–F10 закрыты автором ревью (verified: encryptedSecret+secretPrefix, F2-фильтр, F3 NOOP, F4 socket-level SSRF, F5 per-credential lock, F6 refresh-handler, F7 breaker, F8 cascade, F9 атомарный zod, F10 nextCursor).
- **Re-run #2**: FAIL (1 HIGH X1 + 3 MEDIUM X2–X4 + 4 LOW X5–X8) — хвосты самой ремедиации.
- **Re-run #3 (этот)**: верификация фиксов X1–X8 → все закрыты (см. таблицу).

## Findings

| ID | Category | Severity | Location(s) | Summary | Resolution |
| --- | -------- | -------- | ----------- | ------- | -------------- |
| X1 | Consistency (reintroduced audit conflict) | ~~HIGH~~ RESOLVED | spec.md §1.3 taboo | Табу-строка читала «OAuth — только OWNER/OPERATOR» вопреки FR-601/STRIDE/Q7 «строго OWNER» | **Закрыто**: табу теперь «OAuth для подключения календаря — **строго OWNER** (OPERATOR/PERFORMER → 403, канон FR-601/Q7)» — конфликт устранён по всему документу (grep-verified: OWNER/OPERATOR в табу больше нет) |
| X2 | Logic gap (circuit breaker semantics) | ~~MEDIUM~~ RESOLVED | spec FR-606/NFR-604, data-model §1.3, contracts/outbound-webhooks §3 | Семантика `failureCount` не была определена (подряд vs кумулятив; сброс только через OWNER PATCH) | **Закрыто**: во всех 4 файлах зафиксировано «успешная доставка (2xx) → `failureCount = 0`», breaker строго на 10 подряд; в контракт добавлен тест-ряд «9 сбоев → успех → 9 сбоев → breaker НЕ сработал» |
| X3 | Consistency (dead mechanism) | ~~MEDIUM~~ RESOLVED | spec FR-607 | Мёртвый механизм `?pii=full` (query-параметр, отсутствующий в контракте, с security-запахом) | **Закрыто**: FR-607 теперь «ПДн — всегда маскированы (`pii=masked`, без механизма размаскировки в 006)»; align с contracts/outbound-webhooks.md; упоминание `pii=full` осталось только в changelog-заметке rev 1.2 (легитимная историческая ссылка) |
| X4 | Consistency (contract rows → TC) | ~~MEDIUM~~ RESOLVED | qa/test-cases.md | 3 строки контрактов без TC: token-refresh коллбэк (F6), DNS Rebinding на вызове (F4), детерминированный nextCursor (F10) | **Закрыто**: добавлены TC-GCAL-044 (refresh-коллбэк → `encryptedPayload` обновлён, формат `v1:` сохранён), TC-WHK-034 (TOCTOU DNS Rebinding → connect-hook abort, 0 байт наружу, `ssrf_blocked`), TC-API-039 (3 страницы 100/100/50, детерминизм compound-курсора `createdAt_id`, чужой курсор → 422); TC-API-034 уточнён под `{ data, nextCursor }`; счётчик хедера обновлён до 46 TC |
| X5 | Traceability (spec revision) | ~~LOW~~ RESOLVED | spec.md header, plan.md header | Заголовок спеки остался rev 1.1 при материальных изменениях F1–F10 | **Закрыто**: spec поднят до **REVISION 1.2** с changelog-примечанием (F1–F10 + X1–X3); plan.md header и doc-tree обновлены на rev 1.2 |
| X6 | Consistency (stale reference) | ~~LOW~~ RESOLVED | spec.md header, §1.2 | Ссылки на бизнес-план «v18.9» устарели | **Закрыто**: header и §1.2 → v19.0 (отсылка «ICP v18.9» в Q8 сохранена осознанно — перебалансировка ICP случилась именно в v18.9) |
| X7 | Editorial | ~~LOW~~ RESOLVED | spec.md §3 (F5/F2 edge cases) | Опечатки «при сиSync» / «сиSync-воркером» | **Закрыто**: «при sync» / «sync-воркером» (grep-verified: 0 вхождений) |
| X8 | Editorial | ~~LOW~~ RESOLVED | spec.md Key Entities | «`ShopSettings.remoteMeetingEnabled`-флаг на `Item`» — смесь имён сущностей | **Закрыто**: «флаг `Item.remoteMeetingEnabled Boolean @default(false)` (data-model §1.4)» |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |
| FR-601 oauth-connect-owner-per-resource | ✅ | T010, T011, T020 | +F8 cascade, F6 refresh-handler (TC-GCAL-044) |
| FR-602 push-fsm-matrix | ✅ | T012, T021, T025 | +F3 идемпотентный delete |
| FR-603 busy-import-per-resource | ✅ | T010, T022, T023 | +F2 фильтр, F5 per-credential lock |
| FR-604 sync-health-fail-open | ✅ | T024 | |
| FR-605 ics-attach | ✅ | T030, T031 | |
| FR-606 webhook-registry | ✅ | T040, T041 | +F1 encryptedSecret, F4 socket-level (TC-WHK-034), F7 breaker с reset-on-success |
| FR-607 webhook-events | ✅ | T041 | pii=masked always (X3) |
| FR-608 read-only-api | ✅ | T042 | +F10 nextCursor (TC-API-039) |
| FR-630/631/632 zod | ✅ | T051, T050, T052 | +F9 атомарный коммит |
| NFR-601..605 | ✅ | T022/T062, T023, T011/T024, T041, T001 | NFR-604 семантика зафиксирована (X2) |

Coverage % (requirements with ≥1 task): **16/16 = 100%** (+ подстрока NFR-602b = 17 traceable rows). Контрактные матрицы: gcal-adapter §5 — 16/16 строк покрыто TC; outbound-webhooks §6 — 14/14 строк покрыто TC (X4 закрыт).

## Constitution Alignment Issues

- Принцип VI (cross-AI gate): antigravity PASS ✅ (1 из 2 внешних); analyze re-run #3 PASS ✅ — ожидается ≥1 ревьюер другого провайдера.
- Принцип XII: audit PASS, RTM 16/16, test-design 46 TC + 2 charters; Critical FR-602/603 — DT+STM+Exploratory+UAT.
- Принцип X: манифест консистентен. Остальные принципы: без нарушений; 6 стейдж-тегов на месте.

## Commercial / Business Plan Alignment

- Plan loaded: v19.0 (spec-ссылки обновлены X6; отсылка ICP v18.9 в Q8 — корректная историческая).
- Sprint B floor, Ladder Protection, лимит «≤1» (GC), riders = инфраструктура, Demand Gate, бренд-изоляция — сверено: **No commercial drift detected.**

## Unmapped Tasks

Нет — 22 задачи мапятся; граф не менялся (0 циклов, 0 орфанов, счётчики 3+1+14+1+1+1+1=22 ✅).

## Metrics

- Total Requirements: 16 (11 FR + 5 NFR) + подстрока NFR-602b = 17 traceable rows
- Total Tasks: 22 ✅
- Coverage %: 100% FR/NFR; 100% contract-matrix rows (X4)
- Ambiguity count: 0 · Duplication count: 0
- CRITICAL count: 0
- HIGH count: 0 (X1 закрыт)
- MEDIUM count: 0 (X2–X4 закрыты)
- LOW count: 0 (X5–X8 закрыты)

## VERDICT

```yaml
verdict: PASS
override_reason:
reviewer: analyze
reviewed_at: 2026-10-26T00:00:00Z
commit: ea2b1be98f8af880b1fdfb316c81ba4a3e526289
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

Re-run #3: все находки re-run #2 (1 HIGH + 3 MEDIUM + 4 LOW) закрыты и верифицированы grep-проверками по файлам. Спека rev 1.2 консистентна по ролям, семантике breaker'а, маскировке ПДн и ревизиям; контрактные матрицы полностью покрыты TC (46 + 2 charters). Статус гейта Principle VI: analyze PASS ✅ + antigravity PASS ✅ — ожидается ≥1 внешний ревьюер из другого провайдера до `/speckit.implement`.
