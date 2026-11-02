# Regression Suite: 007-code-review-fixes

## Smoke Suite (P0) — ≤15 минут, блокирует деплой на staging

| TC | Что проверяет |
|---|---|
| TC-007-006 | grep-пруф 0 дефолтных секретов/солей (SC-001) |
| TC-007-013 | grep-пруф 3/3 fetch с AbortSignal.timeout (SC-004) |
| TC-007-021 | CI-гейт: tsc + jest (418+) + снапшоты + npm audit |
| TC-007-022 | diff package.json — 0 новых deps |

## Sanity Suite (P1) — ≤45 минут, затронутые подсистемы

| TC | Что проверяет |
|---|---|
| TC-007-001..003 | env-матрица секретов (fail-closed + fallback) |
| TC-007-004, 005 | delivery-log соль |
| TC-007-007 | RESCHEDULE 501 |
| TC-007-008, 011 | money-path: happy-path + идемпотентность ретрая |
| TC-007-012 | таймауты на моках |
| TC-007-017, 018 | WhatsApp verify |

## Full Regression (P2) — перед мажорным релизом / qa-signoff

Все 22 TC + базовая линия 006 (418 тестов) + смежные подсистемы: sign-in flow (lockout не сломан), email-доставка, NOWPayments webhook сквозняк, staff-бот reschedule-оффер (с секретом), WhatsApp handshake.

## Прогон

| Окно | Suite | Триггер |
|---|---|---|
| Каждый tasks-коммит | Smoke | локально перед push |
| Перед `/speckit.qa-signoff` | Sanity + Full | staging deploy |
| После qa-signoff | — | UAT-001/002 business sign-off |
