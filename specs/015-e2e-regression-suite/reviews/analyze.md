# SpecKit Analyze: 015-e2e-regression-suite

**Reviewer**: analyze (self-consistency, run #1)
**Reviewed at**: 2026-11-19T02:10:00+04:00
**Commit**: c8a10fc (spec v1.1 clarified + plan + tasks; tags spec/clarify/plan/tasks/015-e2e-regression-suite/v1)
**Artifacts**: `spec.md` (rev 1.1), `plan.md`, `tasks.md`, `playwright.config.ts` (факт), `tests/e2e/*` (факт), `tests/helpers/*` (факт), `.specify/memory/constitution.md` v1.10.1
**База**: спека выросла из факт-разведки e2e-слоя (015 specify зафиксировал канон `otpFromDb` и gaps 002–014)

---

## Findings

| ID | Category | Severity | Location(s) | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A1 | Coverage | LOW | `tasks.md` vs FR-1506 | Fixture-канон `seed-booking.ts` (FR-1506) реализуется T1503, но hour-bucket-помощник подразумевается и в T1510/T1511/T1520 — явная ссылка на helper в тестовых задачах не прописана | В T1510/T1511 добавить «(uses `seed-booking.ts` fixtures)» при имплементации — cosmetic |
| A2 | Underspecification | LOW | `spec.md` FR-1502 vs T1511 | Fake-`clientSecret` детерминирован ('cs_test_e2e'), но `DepositPayment` валидирует формат Stripe-секрета? — не проверено; если валидация есть, fake-секрет надо подогнать | При T1501 сверить требования `DepositPayment`/Stripe Elements к формату clientSecret; подогнать fake-значение |
| A3 | Consistency | LOW | `plan.md` Risks vs tasks | Риск «зависание dev-бута» указан, но ремеди (health-check curl в helper) не отражено задачей — лег в T1503 имплементацию естественным образом | Принято как часть T1503; отдельно не заводить |

No CRITICAL/HIGH/MEDIUM findings. Spec↔plan↔tasks согласованы: 4 clarify-решения прошиты в FR-1502 и plan Key Decisions; Via Negativa spec ↔ plan taboos ↔ task-границы сходятся (0 deps, без реальных внешних сервисов, без int-дублей, без TRUNCATE).

## Coverage Summary

| Requirement Key | Has Task? | Task IDs | Notes |
| --- | :---: | --- | --- |
| FR-1501 (Composite journey e2e) | Yes | `T1510` | US1 P0 |
| FR-1502 (Money surfaces e2e + gateway gate) | Yes | `T1501`, `T1511` | clarify Q1 решён |
| FR-1503 (Token pages e2e) | Yes | `T1520` | US3 P1 + composite-reschedule AG-F3.2 |
| FR-1504 (Fast path e2e) | Yes | `T1521` | US4 P1 |
| FR-1505 (Waitlist/Admin/i18n e2e) | Yes | `T1530` | US5–7 P2, optional to MVP |
| FR-1506 (Fixtures канон) | Yes | `T1503` | seed-booking + hour-buckets |
| FR-1507 (Config fix) | Yes | `T1502` | baseURL additive |
| NFR-1501..1506 | Yes | `T1540`, `T1541` | RTM-lite, полный прогон, флейк/скорость |

All US1–US7 map to tasks; edge cases §3 покрыты внутри US1–US4 тест-кейсов (cache-poisoning, 409 race, 422 UI, OTP expiry/resend, token replay).

## Constitution Alignment Issues

- **VI**: ON TRACK — нужен ≥2 external PASS (или owner override) до `/speckit.implement`.
- **VII**: PASS — spec/clarify/plan/tasks tagged v1 (beb9a6e → 894348c → c8a10fc).
- **VII-B**: PASS — BP unchanged.
- **IX**: DEVIATION (lineage main, как 001–014) — осознанно.
- **X**: n/a — миграций нет.
- **XIII**: PASS — 9 задач, WIP в лимите.

## Commercial / Business Plan Alignment

- BP v2.7.2 unchanged — спека качества (укрепление проданного канона §2.2), коммерческой дельты нет. Focus laws не задеты.

## Unmapped Tasks

- `0` unmapped. Graph валиден (9 задач, без циклов/сирот; shared files изолированы).

## Metrics

- Total Requirements: `7 FR + 6 NFR = 13`
- Total Tasks: `9`
- Coverage %: `100%`
- Ambiguity count: `0` (4 open questions закрыты clarify)
- Duplication count: `0`
- CRITICAL/HIGH/MEDIUM: `0/0/0`
- LOW: `3`

## VERDICT

```yaml
verdict: PASS
override_reason: null
reviewer: analyze
reviewed_at: 2026-11-19T02:10:00+04:00
commit: c8a10fc
critical_count: 0
high_count: 0
medium_count: 0
low_count: 3
```

**Next**: ×2 external review (`/speckit.review`) или owner override → `/speckit.implement`.
