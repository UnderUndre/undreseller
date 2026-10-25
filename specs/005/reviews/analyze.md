# SpecKit Analyze: 005 (005-stripe-adapter-and-sovereign-auth)

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-10-26T00:00:00Z
**Commit**: 2d0b8e1
**Artifacts**: spec.md (rev 2.2), plan.md, tasks.md, research.md, data-model.md, contracts/stripe-adapter.md, quickstart.md, qa/ (rtm-matrix, test-cases, uat-scenarios, regression-suite, preliminary-rtm), requirements-audit.md

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | -------- | -------- | ----------- | ------- | -------------- |
| F1 | Inconsistency | MEDIUM | tasks.md §Agent Summary, §Total | Счётчики не сходятся с фактом: заявлено «Total: 27», фактически **29** задач; Agent Summary: `[DB]`=4 (факт 3), `[BE]`=12 (факт 15). Сами задачи/граф валидны — ошибка только в цифрах | Править числа в tasks.md (Total 29; DB 3; BE 15) — 1-строчный патч |
| C1 | Underspecification | MEDIUM | spec.md FR-541, tasks.md T061 | uk-локаль не привязана к `ShopSettings.enabledLocales` (механизм 004): как uk «включается» на инстансе (значение enabledLocales? отдельный флаг?) не описано — риск расхождения переключателя и реально отдающихся локалей | В FR-541/T061 зафиксировать: uk доступна в переключателе ⇔ `enabledLocales` содержит 'uk'; настройка — существующий OWNER-экран настроек |
| G1 | Agent Routing | MEDIUM | tasks.md §Dependency Graph, T010/T070 | `schema.prisma` — shared file двух задач одного агента (T010, T070); последовательность оговорена текстом и фазовыми барьерами, но **ребра T010 → T070 в графе нет** — при смене исполнителя/параллельном диспетче возможна гонка | Добавить ребро `T010 → T070` (или перенести оговорку в граф) — формализует барьер |
| E1 | Coverage | LOW | spec.md NFR-1, tasks.md | NFR-1 (общий RSS ≤500 MB инстанса) не имеет выделенной задачи: покрывается частично T024 (Argon2-пик) и T082 (трейсер) | Добавить в T082 шаг «зафиксировать RSS инстанса после трейсера» — замер без новой задачи |
| E2 | Coverage | LOW | spec.md FR-504, tasks.md | FR-504 (break-glass ADMIN_TOKEN без изменений) не имеет задачи — намеренно (no-change-requirement, покрыт регрессией TC-MAIN) | Принять как есть; пометка в Coverage Summary |
| D1 | Constitution | LOW | plan.md §Constitution Check IX, branch | Branch `005` вместо `specs/<slug>`-фазы — тот же grandfathered-девиант, что 004 (задокументирован, retro обещана) | Закрыть в `/speckit.retrospective` 004/005 совместно |
| D2 | Constitution VII | LOW | undreplans (соседний репо) | Bizplan-мутация v18.8 живёт в другом репозитории — тег `bizplan/005/*` в пайплайн-репо не ставится (прецедент 004: bizplan-тегов нет) | Либо принять конвенцию (записать в retro), либо ставить lightweight-тег в undreseller на коммит-ссылку плана |

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |
| FR-501 argon2id-rehash | ✅ | T012, T020 | |
| FR-502 session-epoch-revoke | ✅ | T013, T023 | Model A int-равенство |
| FR-503 per-ip-rate-limit | ✅ | T021 | +регрессия 004-lockout |
| FR-504 break-glass-unchanged | ⚠️ by design | — | no-change; покрытие TC-MAIN (E2) |
| FR-504a argon2-benchmark | ✅ | T012, T024 | evidence-гейт до merge |
| FR-505 auth-audit-events | ✅ | T022 | каноничные имена 004 |
| FR-510 stripe-adapter-registry | ✅ | T030 | |
| FR-511 createinvoice-ttl-hold | ✅ | T030, T034 | TTL=hold-TTL 15 мин |
| FR-511a stripe-failure-no-hold | ✅ | T033 | 503 + STRIPE_INVOICE_FAILED |
| FR-512 verify-signature | ✅ | T030, T031 | |
| FR-513 parse-callback | ✅ | T030 | |
| FR-514 webhook-dedup-replay | ✅ | T031, T032 | Promise.all×100 |
| FSM-§3 event-mapping | ✅ | T031, T032 | DT+STM |
| FR-515 dashboard-refunds | ✅ | T031 | |
| FR-516 provider-selection | ✅ | T030, T034 | |
| FR-520 zod4-audit-zero | ✅ | T041 | |
| FR-521 zod4-api-migration | ✅ | T041 | |
| FR-522 error-shape-snapshots | ✅ | T040, T042 | |
| FR-530 lock-308-sunset | ✅ | T050, T051 | |
| FR-531 unified-conflict-logic | ✅ | T050 | |
| FR-540 reject-notify-db | ✅ | T060 | |
| FR-541 uk-locale | ✅ | T061 | см. C1 (enabledLocales) |
| FR-542 format-minor | ✅ | T062 | |
| FR-550 orphan-models-cleanup | ✅ | T002, T070 | |
| NFR-1 rss-500mb | ⚠️ частично | T024, T082 | см. E1 |
| NFR-2 env-config | ✅ | T030 | unit matrix |
| NFR-3 supply-chain | ✅ | T001, T041, T080 | |
| NFR-4 expand-contract | ✅ | T010 | guard-тест |
| NFR-5 argon2-memory-gate | ✅ | T024 | evidence-файл |

## Constitution Alignment Issues

- Принцип IX (two-phase branches): задокументированный девиант (D1, LOW) — не блокирует, закрытие в retro.
- Принцип VI (cross-AI gate): ожидаемо «ON TRACK» — external reviews ещё не проводились (следующий шаг пайплайна).
- Принцип XII (QA contour): requirements-audit PASS ✅, preliminary-rtm ✅, test-design ✅ (RTM 23/23 FR; Critical FR-511/514/FSM имеют DT+STM+Exploratory+UAT — проверено по qa/).
- Остальные принципы (I–V, VII, VIII, X, XI): нарушений не найдено; теги стейджей на месте (requirements-audit/005/v1, plan/005/v1, tasks/005/v1, test-design/005/v1).

## Commercial / Business Plan Alignment

- Plan files loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` (v18.8, 2026-10-26 — обновлён этим релизом).
- Focus/hard laws checked: Sprint B $4,900 floor не тронут; Ladder Protection не задет; Stripe квалифицирован Infrastructure Adapter (не расходует «≤1 бизнес-интеграция»); подписки/рекурренты исключены; Demand Gate не задет; CAC/GTM-задач нет; бренд-изоляция (underundre/undrlla) не затронута.
- Findings: **No commercial drift detected.**

## Unmapped Tasks

Нет — каждая из 29 задач мапится минимум на одно требование (счётчик F1 — числовая ошибка, не маппинг).

## Metrics

- Total Requirements: 28 (23 FR + 5 NFR)
- Total Tasks: **29** (факт; в tasks.md заявлено 27 — F1)
- Coverage % (requirements with ≥1 task): 27/28 = 96% (FR-504 by design; NFR-1 частично)
- Ambiguity count: 0
- Duplication count: 0
- CRITICAL count: 0
- HIGH count: 0
- MEDIUM count: 3
- LOW count: 4

## VERDICT

```yaml
verdict: PASS
override_reason:
reviewer: analyze
reviewed_at: 2026-10-26T00:00:00Z
commit: 2d0b8e1
critical_count: 0
high_count: 0
medium_count: 3
low_count: 4
```

MEDIUM-находки (F1 счётчики, C1 uk↔enabledLocales, G1 ребро T010→T070) — точечные правки текста/графа, не меняют скоуп и архитектуру; рекомендуются до `/speckit.review`, чтобы внешние ревьюеры не тратили раунд на них.
