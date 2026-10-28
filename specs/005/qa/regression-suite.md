# Regression Suite: 005 (планы прогонов)

## Smoke Suite (P0, ≤15 мин, блокирует деплой на staging)

| TC | Что | Env |
|---|---|---|
| TC-005-001 | Логин + пере-хеш Argon2id | базовые креды |
| TC-005-005 | Per-IP 429 | 2 IP (или рестарт инстанса) |
| TC-005-008 | Epoch-отзыв ≤1 запрос | 2 роли |
| TC-005-012 | Argon2 evidence-файл ≤500 MB | evidence |
| TC-005-013 | Checkout TTL 15 мин | Stripe test keys |
| TC-005-014 | Оплата 4242 → BOOKED/PAID | Stripe test keys + `stripe listen` |
| TC-005-015 | Replay ×3 deduplicated | Stripe CLI |
| TC-005-019 | Refund → CANCELLED | Stripe Dashboard |
| TC-005-020 | Подделка подписи → 401 | curl |
| TC-005-027 | Снапшоты 400-форм зелёные | CI |
| TC-005-028 | audit 0 H/C + лицензии | npm |
| TC-005-030 | 308 + Sunset | curl |
| TC-005-037 | Чистая база без P2021 | scratch DB |

≈13 кейсов, 12–15 минут при готовом окружении. Любой FAIL = стоп-деплой.

## Sanity Suite (P1, ≤45 мин, затронутые смежные подсистемы)

Все Smoke + TC-005-002, 003, 006, 009, 011, 016, 017, 021, 023, 031, 033, 034, 035, 036.
Требует: Stripe test mode (ключи + CLI + Dashboard), два сетевых источника, тест-инстанс KWD/JPY (переконфигурация валюты), uk-локаль.

## Full Regression (P2/P3, перед мажорным релизом / промоушеном ветки)

Все 38 TC + Extended (010, 018, 022, 024, 025, 026) + Regression-класс (004, 007, 029, 032, 038) + оба Exploratory Charter'а (CH-005-01/02) + кросс-сьют `specs/main/qa/test-cases.md` (killswitch-матрица и mixed-surfacing TC-MAIN — Stripe добавляет новый провайдер в конфиг-матрицу).

## Environment Prerequisites

| # | Требование | Smoke | Sanity | Full |
|---|---|---|---|---|
| 1 | Stripe test keys (sk_test/whsec) | ✅ | ✅ | ✅ |
| 2 | `stripe` CLI (listen + events resend) | ✅(015) | ✅ | ✅ |
| 3 | Stripe Dashboard (test mode, refunds) | ✅(019) | ✅ | ✅ |
| 4 | Домен в Stripe payment domains (wallets) | — | — | ✅(022) |
| 5 | 2 сетевых источника (пер-IP изоляция) | ✅ | ✅ | ✅ |
| 6 | Telegram: клиент + staff-бот аккаунты | ✅ | ✅ | ✅ |
| 7 | Тест-конфиг валют KWD/JPY | — | ✅(036) | ✅(025,036) |
| 8 | Scratch PostgreSQL (миграция 037) | ✅ | ✅ | ✅ |
| 9 | iPhone/Safari (Apple Pay 022) | — | — | ✅ |
| 10 | Доступ к psql (проверки состояний) | ✅ | ✅ | ✅ |
| 11 | FEATURE-флаги 004 включены (fsm/payment cutover) | ✅ | ✅ | ✅ |
| 12 | Seeded: owner@qa-underundre.com, op@…, prepaid-сервис $50 | ✅ | ✅ | ✅ |

## Правила

- SKIPPED ≠ PASSED — только явные отметки исполнения.
- Каждый прогон: колонка Defect IDs в rtm-matrix.md обновляется.
- Дефекты money-path (US2) — блокируют релиз; US3–US6 дефекты P2 могут ехать с Residual Risk Register (qa-signoff APPROVED WITH RISKS).
