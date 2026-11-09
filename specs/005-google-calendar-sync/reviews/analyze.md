# SpecKit Analyze: 005-google-calendar-sync (re-scope: Calendar Feed)

**Reviewer**: analyze (same-tool self-consistency)
**Reviewed at**: 2026-11-09T05:40:00Z (run #1)
**Artifacts**: spec rev 2.0, requirements-audit (PASS run #1), plan.md, research.md (D1–D6), tasks.md (5 задач), qa/ (preliminary-rtm, rtm-matrix 8/8, test-cases 12 TC, uat-scenarios 3, regression-suite), бизнес-план v2.6.0 (`2f7fcf4`, undreplans)

## Findings

| ID | Severity | Summary | Resolution |
| --- | --- | --- | --- |
| A1 | LOW | Слаг директории `005-google-calendar-sync` ≠ новому скоупу (Calendar Feed) — сохранён ради истории тегов (`spec/005-google-calendar-sync/v1`); заголовок спеки явно документирует маппинг | Зафиксировано в шапке спеки |
| A2 | LOW | Упрощение SEQUENCE (D4: 0 активная / 1 CANCELLED) — осознанный trade-off METHOD:PUBLISH; reschedule-правки propagate через UID+DTSTAMP без роста SEQUENCE | Зафиксировано в D4 + тест TC-005-006 |
| A3 | LOW | Токен в querystring попадает в чужие access-логи — принятый риск (rotate как ответ), задокументирован в plan Risks | Risks-таблица плана |

## Coverage Summary

| Requirement | Task(s) | TC |
| --- | --- | --- |
| FR-501 | T520 | 001–003, 008* |
| FR-502 | T510 | 004–006 |
| FR-503 | T520 | 007 |
| FR-504 | T521 | 009–010 |
| NFR-501..504 | T530 | 011–012 |

*TC-005-008 (rate limit BVA) в test-cases числится под FR-501 — прямой маппинг в rtm-matrix задокументирован.

**Coverage: 8/8 = 100%** · RTM 8/8 (12 TC) · Tasks 5, граф валиден (0 циклов/орфанов), критический путь T511→T520→T530.

## Constitution Alignment

- VI: ON TRACK — до implement нужно ≥2 внешних PASS или logged override. VII-B: план v2.6.0 синхронизирован (waiver не нужен — VII-B.4 PASS). X: additions-only. XII: Risk ≤12, security-DT проактивно. Остальные: PASS/N/A.

## Commercial

- План v2.6.0 §2.3: единственная бизнес-интеграция в форме Calendar Feed; GC two-way заморожен до L1-сигнала; Яндекс исключён владельцем. Цены/ICP не тронуты.

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-11-09T05:40:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 3
```

Гейт VI: до implement — ≥2 внешних ревью PASS (или logged override).
