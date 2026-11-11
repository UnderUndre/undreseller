# SpecKit Analyze: 007-booking-trust-gate

**Reviewer**: analyze (same-tool self-consistency)
**Reviewed at**: 2026-11-11T20:40:00Z (run #1)
**Artifacts**: spec rev 1.1, requirements-audit (PASS run #2), plan.md, research.md (D1–D7), tasks.md (8 задач), qa/ (preliminary-rtm, rtm-matrix 12/12, test-cases 20 TC, uat-scenarios 3, regression-suite), план v2.7.1 (`b84bf9e`, undreplans)

## Findings

| ID | Severity | Summary | Resolution |
| --- | --- | --- | --- |
| A1 | LOW | Двухфазный роут ломает существующих клиентов POST /api/booking? — нет: публичных клиентов ещё нет (0 деплоев), фаза-1 контракт новый с рождения гейта | Зафиксировано |
| A2 | LOW | OTP-письмо и claim/unsub-письма могут приходить клиенту каскадом (waitlist + booking) — шаблоны различаются subject'ом | Канон 005: шаблоны с разными subject |
| A3 | LOW | `hasVerifiedEmail` — без индекса по email поиск consumed-истории линейный | T711 добавит индекс `(customer_email, status)` — аналогично канону F13 |
| A4 | LOW | INTENT_CAP 2 live/email — а legit-клиент хочет два брониing на разные услуги одновременно? | Принято: кап только на PENDING-интенты (не на брони); два live интента = два письма в очереди — ок |

## Coverage Summary

| Requirement | Task(s) | TC |
| --- | --- | --- |
| FR-701 | T710 | 001–003 |
| FR-702 | T720 | 004–009 |
| FR-703 | T721 | 010–011 |
| FR-704 | T730 | 012–014 |
| FR-705 | T731 | 015 |
| FR-706 | T731 | 016–017 |
| FR-707 | T740 | 018 |
| NFR-701..704 | T741 | 019–020 |

**Coverage: 12/12 = 100%** · RTM 12/12 (20 TC + чартер E-04 + UAT-01 на Risk 20) · Tasks 8, граф валиден (0 циклов/орфанов), критический путь T710→T711→T720→T721→T740→T741.

## Constitution Alignment

- VI: ON TRACK — до implement нужно ≥2 внешних PASS или logged override. VII-B: план v2.7.1 без дельты. X: additions-only. XII: Risk 20 (FR-702) → STM+DT+EG+UAT покрыты. XIII: WIP=1. Остальные: PASS/N/A.

## Commercial

- План v2.7.1: trust gate — защита инвентаря календаря (ядра оффера), не фича-монетизатор. ICP/цены/рельсы не тронуты. Отклик на Cal.com closed-source — окно OSS-ниши для white-label с защитой от первого деплоя.

## VERDICT

```yaml
verdict: PASS
reviewer: analyze
reviewed_at: 2026-11-11T20:40:00Z
critical_count: 0
high_count: 0
medium_count: 0
low_count: 4
```

Гейт VI: до implement — ≥2 внешних ревью PASS (или logged override).
