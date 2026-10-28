# Regression Suite: 006-google-calendar-and-integrations

**Generated**: 2026-10-26 · **Принцип**: SKIPPED ≠ PASSED; тираж по временным окнам, не «гоняем всё подряд».

## Smoke Suite (P0) — ≤15 минут, блокирует деплой на staging

| # | TC | Суть | Время |
|---|---|---|---|
| 1 | TC-GCAL-001 | Connect OAuth happy path (или переиспользование живого подключения) | 3 мин |
| 2 | TC-GCAL-005 | BOOKED → событие в GC ≤60 с | 4 мин |
| 3 | TC-GCAL-006 | Реплей ×20 → 1 событие | 2 мин |
| 4 | TC-GCAL-007 | CANCELLED → событие удалено | 1 мин |
| 5 | TC-WHK-028 | Webhook подписан и доставлен ≤5 с | 2 мин |
| 6 | TC-API-035 | API без ключа → 401 | 1 мин |
| 7 | TC-ZOD-039 | `npm audit` 0 H/C | 1 мин |
| 8 | Legacy TC-MAIN-01/02 (004) | Бронь без интеграций + health | 1 мин |

**Гейт**: любой падающий Smoke = деплой на staging запрещён.

## Sanity Suite (P1) — ≤45 минут, смежные подсистемы после изменения затронутой зоны

| Зона изменения | TC |
|---|---|
| Интеграции/админка | TC-GCAL-002, 004, 009, 011, 017, 020, TC-WHK-025, 028 (повтор), 033 |
| Слот-движок (availability тронут — T023) | TC-GCAL-012, 015, 016 + legacy слот-кейсы 004 (30-мин сетка, корзина) |
| Email (ICS-аттач) | TC-ICS-021, 023 + legacy email-кейсы 004 |
| Webhooks/API | TC-WHK-026, 031, TC-API-034, 036–038 |
| zod-миграция | TC-ZOD-040, 041, 042 |
| Security-контур | TC-GCAL-003, 019, TC-WHK-027, 029, 030 |

## Full Regression (P2/P3) — перед мажорным релизом и промоушеном ветки

- Все 43 TC + 2 Exploratory Charter (EXP-01, EXP-02 — 60 мин каждый, отдельная сессия)
- Legacy-контур 004/005 полностью: manual-qa-test-cases.md (35 кейсов 002), TC-MAIN 004, платежный матрикс (NOWPayments/Stars/Stripe), auth-харднинг 005 (Argon2/epoch/IP-limit), UAT 005
- Perf/evidence: TC-GCAL-018 (p95 слот-расчёта), TC-GCAL-043 (RSS), NFR evidence-таблица RTM — все `[PENDING]` обязаны получить значения

## Прогонные окна

| Окно | Набор | Триггер |
|---|---|---|
| Каждый деплой на staging | Smoke | CI/CD |
| После merge каждой фазы задач (T010–T025 / T030+ / T040+ / T050+) | Sanity затронутой зоны | PR-merge |
| Перед `/speckit.qa-signoff` и промоушеном | Full Regression | релиз-кандидат |

## Связь с пайплайном

- Прогон на staging/preview → `qa/signoff-report.md` через `/speckit.qa-signoff` (APPROVED / APPROVED WITH RISKS + Residual Risk Register / BLOCKED).
- Дефекты — по шаблону из `test-cases.md` с Level 1 Evidence; SKIPPED ≠ PASSED.
