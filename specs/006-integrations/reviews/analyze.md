# SpecKit Analyze: 006-integrations (006-google-calendar-and-integrations)

**Reviewer**: analyze (Claude self-consistency)
**Reviewed at**: 2026-10-31T12:30:00Z (**re-run #4** — после remediation zcode F1–F10)
**Commit**: f8ea697c907116ae6714bebec2be2041174b8abc (артефакты 006 в working tree, незакоммичены)
**Artifacts**: spec.md (rev 1.3), plan.md, tasks.md, data-model.md, contracts/gcal-adapter.md, contracts/outbound-webhooks.md, quickstart.md, requirements-audit.md, qa/ (rtm-matrix, test-cases 51 TC, uat-scenarios, regression-suite, preliminary-rtm), reviews/ (antigravity.md PASS, zcode.md PASS re-run), reviews/analyze.md (re-run #3 PASS)
**Feature resolution**: check-prerequisites резолвит по ветке (`004-release-readiness`, IX-девиация → `specs/main`) — анализ явно по `specs/006-integrations/` (канон re-run #3).

## Context of re-runs

- **Re-run #3**: PASS (закрыты X1–X8 ремедиации antigravity/analyze #2).
- **Внешнее ревью zcode**: первый раунд MEDIUM (2 HIGH / 6 MEDIUM / 2 LOW) → автор применил F1–F10 → zcode re-run PASS.
- **Re-run #4 (этот)**: верификация фиксов F1–F10 по всем артефактам + grep-свипы.

## Findings

> **Y1/Y2 закрыты (2026-10-31, после re-run #4)**: Y1 — терминология «freeBusy» заменена на «busy-импорт (`events.list`/syncToken)» по всему нарративу (spec §1.2/§3/Kill Criteria/STRIDE/Q1, plan Summary, gcalClient в plan/tasks — выровнено с контрактным интерфейсом `CalendarClient`, где freeBusy-метода нет); research.md сохраняет упоминания freeBusy легитимно — это документ альтернатив (D3). Y2 — TC-GCAL-045 типизирован Negative, соотношение в хедере пересчитано (9/39 = 18%/76%, гейт ≥40/60 держится). Вердикт PASS подтверждён.

| ID | Category | Severity | Location(s) | Summary | Resolution |
| --- | -------- | -------- | ----------- | ------- | ---------- |
| Y1 | Consistency (terminology) | LOW | spec.md §1.1/§1.2, edge case «Часовой дрейф freeBusy» | Импорт занятости называется «freeBusy», но реализация (research D3, contract §4) — `events.list` с syncToken; `freeBusy.query` явно отвергнут (нет event-id для дедупа). Термин в нарративе неточен — читатель может ожидать другой endpoint | Косметика нарратива: «импорт занятости GC (инкрементальный `events.list`, syncToken)». Не блокирует — research D3 документирует расхождение |
| Y2 | Consistency (doc arithmetic) | LOW | qa/test-cases.md header | Соотношение Positive/Negative+Boundary (10/38) — оценка: TC-GCAL-045 типизирован как Functional, но по содержанию (отмена экземпляра) — негативный; границы категории тут договорные, не машинные | Опционально: типизировать 045 как Negative. Не влияет на гейт ≥40/60 |

Прочие проверки фиксов F1–F10 — **закрыты, без хвостов**:
- **F1-rev**: contract §4 (full-sync с параметрами / чистый инкрементал, рекуррентные экземпляры) ↔ spec FR-603 ↔ edge cases ↔ T022 ↔ TC-GCAL-045/046 — согласовано; строка «syncToken+timeMin → 400» в §5 явно запрещает старое сочетание. Grep `xact_lock` вне ревью — 0.
- **F2-rev**: NULLS NOT DISTINCT в data-model §1.1 + манифест §3 + T010 + TC-GCAL-048 — 4/4 файлов.
- **F3-rev**: PATCH 404 → re-CREATE в contract §2 + spec FR-602 + T021 + TC-GCAL-047 — 4/4.
- **F4-rev**: session-level lock — spec edge case + contract §4 + T022 — согласовано (справа и unlock в `finally`).
- **F5-rev**: таймзона ICS — US2 acceptance теперь ссылается на `ShopSettings.timeZone`, противоречие с FR-605 устранено (grep «таймзоне брони» — только с канон-пометкой).
- **F6-rev**: `Order.meetLink` — data-model §1.4a + §2 (Order исключён из «не модифицируются») + манифест §3 + spec FR-602/edge + T010/T021/T025 — согласовано; правило «письмо без Meet, если push не вернулся» зафиксировано.
- **F7-rev**: timestamp от момента попытки — contract §2 + тест-строка §6 + T041 + TC-WHK-035 — согласовано.
- **F8-rev**: ICP-нарратив v20.0 (сервисный бизнес 3–25, соло — Tertiary) в spec §1.1; ссылки v20.1 в spec header/§1.2/plan VII-B. Grep «частные специалисты и ИП» — 0 вне ревью. Q8 «ICP v18.9» — легитимная историческая отсылка (перебалансировка случилась в v18.9).
- **F9/F10-rev**: runbook-пункты в T061 + edge case F10-rev (GC-сироты, delete-задача доигрывается при reconnect) — согласовано.

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --------------- | --------- | -------- | ----- |
| FR-601 oauth-connect-owner-per-resource | ✅ | T010, T011, T020 | +F2-rev NULLS NOT DISTINCT, F8 cascade, F6 refresh-handler |
| FR-602 push-fsm-matrix | ✅ | T012, T021, T025 | +F3-rev PATCH 404→re-CREATE, F6-rev meetLink persist |
| FR-603 busy-import-per-resource | ✅ | T010, T022, T023 | +F1-rev sync-механика/рекуррентность, F4-rev session lock |
| FR-604 sync-health-fail-open | ✅ | T024 | |
| FR-605 ics-attach | ✅ | T030, T031 | +F5-rev таймзона унифицирована |
| FR-606 webhook-registry | ✅ | T040, T041 | +F7-rev timestamp попытки, F1 encryptedSecret, F4 SSRF, F7 breaker |
| FR-607 webhook-events | ✅ | T041 | pii=masked always |
| FR-608 read-only-api | ✅ | T042 | +F10 nextCursor |
| FR-630/631/632 zod | ✅ | T051, T050, T052 | +F9 атомарный коммит |
| NFR-601..605 | ✅ | T022/T062, T023, T011/T024, T041, T001 | |

Coverage % (requirements with ≥1 task): **16/16 = 100%** (+ подстрока NFR-602b = 17 traceable rows). Контрактные матрицы: gcal-adapter §5 — 19/19 строк покрыто TC (16 + 3 новых F1/F3-rev); outbound-webhooks §6 — 15/15 строк (14 + 1 новая F7-rev).

## Constitution Alignment Issues

- Принцип VI (cross-AI gate): analyze re-run #4 PASS ✅ + antigravity PASS ✅ + zcode PASS (re-run) ✅ — **гейт из двух внешних ревьюеров закрыт**.
- Принцип XII: audit PASS, RTM 16/16, test-design 51 TC + 2 charters; Critical FR-602/603 — DT+STM+Exploratory+UAT.
- Принцип X: манифест консистентен — оба новых поля (`remoteMeetingEnabled` NOT NULL DEFAULT, `meetLink` nullable) аддитивны; Contract-фаза не требуется. Остальные принципы: без нарушений; IX — тот же grandfathered lineage (в retro).

## Commercial / Business Plan Alignment

- Plan loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v20.1 (2026-10-31).
- Focus laws / SKU floors: лимит «≤1» расходуется на GC (канон v19.0, не изменён в v20.0/20.1); floor Sprint B $4,900 и Ladder Protection не задеты; riders — инфраструктурный контур; Demand Gate соблюдён (US3 пост-гейт за флагом); бренд-изоляция соблюдена; ICP-нарратив спеки синхронизирован с v20.0 (F8-rev).
- **No commercial drift detected.**

## Unmapped Tasks

Нет — 22 задачи мапятся; граф не менялся (0 циклов, 0 орфанов, счётчики 3+1+14+1+1+1+1=22 ✅).

## Metrics

- Total Requirements: 16 (11 FR + 5 NFR) + подстрока NFR-602b = 17 traceable rows
- Total Tasks: 22 ✅
- Coverage %: 100% FR/NFR; 100% contract-matrix rows
- Ambiguity count: 0 · Duplication count: 0
- CRITICAL count: 0
- HIGH count: 0
- MEDIUM count: 0
- LOW count: 2 (Y1 терминология freeBusy в нарративе; Y2 типизация TC-GCAL-045)

## VERDICT

```yaml
verdict: PASS
override_reason:
reviewer: analyze
reviewed_at: 2026-10-31T12:30:00Z
commit: f8ea697c907116ae6714bebec2be2041174b8abc
critical_count: 0
high_count: 0
medium_count: 0
low_count: 2
```

Re-run #4: ремедиация zcode F1–F10 верифицирована по всем артефактам (кросс-док согласованность 4/4 файлов на каждый фикс), хвостов не осталось. Спека rev 1.3 консистентна; остаточные 2 LOW — косметика нарратива, не блокируют. Гейт Principle VI закрыт полностью: analyze PASS + antigravity PASS + zcode PASS → `/speckit.implement` разрешён.
