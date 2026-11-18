# Implementation Plan: 015-e2e-regression-suite

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom

**Branch**: `main` (single-branch lineage — IX-девиация, как 001–014) | **Date**: 2026-11-19 | **Spec**: rev 1.1 (clarified)
**Input**: `spec.md` rev 1.1 + clarify-решения (gateway/БД/CI/visual) + факт-разведка e2e-слоя (3 файла, канон `otpFromDb`)

---

## Summary

Tiered Playwright-покрытие UI-слоя 002–014 поверх существующего каркаса (без его поломки):

1. **Инфра:** env-гейт `E2E_GATEWAY=fake` в payments-сеаме (fake-PI + тестовый clientSecret — решённый clarify Q1), `baseURL` в playwright.config, fixture-канон `tests/helpers/seed-booking.ts` (уникальные слаги + hour-бакеты, dev-БД без TRUNCATE — clarify Q2).
2. **P0 (US1/US2):** composite journey (чекбоксы → бегущий итог → контейнерный грид → items[] → OTP → itemized confirmation) + кэш-изоляция гридов + 409 race; money surfaces — `DepositPayment` с Σ из `items_json` + absence-кейс.
3. **P1 (US3/US4):** token-страницы (cancel + повтор-409, composite-reschedule по контейнерной сетке, acknowledge) + trust-cookie fast path.
4. **P2 (US5–US7):** waitlist UI, admin (addOn-каталог + approvals items), i18n ru/en — опционально к MVP.
5. **Верификация:** RTM-lite, полный прогон `pnpm test` (int 232 + e2e), флейк-аудит, speed budget.

## Technical Context

- **Language/Version**: TypeScript 5.7.2 / Next.js 16.4.1 / Payload 3.93.0 / Playwright 1.63 (unchanged)
- **New Dependencies**: **0** (Via Negativa)
- **Testing target**: `pnpm test:e2e` (webServer `pnpm dev` :3000, reuseExistingServer); OTP — `tests/helpers/otpFromDb.ts` (HMAC из БД, без почты)
- **Локаторы**: только `data-testid` канон (уже в `SlotGrid.tsx` / OTP-формах)

## Constitution Check

| Принцип | Статус | Примечание |
| --- | --- | --- |
| I–V | PASS | 0 deps, токенно-экономно, без дублей конфигов |
| VI | ON TRACK | analyze + ≥2 external (или owner override) до implement |
| VII | PASS | стадии тегируются snapshot-stage |
| VII-B | PASS | **BP unchanged** — качество проданного канона, дельты нет |
| VIII/XI | PASS | Living spec обновится на T1540; spike = 0 |
| IX | DEVIATION (lineage) | как 001–014 |
| X | n/a | миграций нет (тестовая спека) |
| XII | PASS | RTM-lite на T1540 |
| XIII | PASS | WIP ≤ 2 |

## Key Design Decisions

- **Gateway-сеам (clarify Q1):** `E2E_GATEWAY=fake` читается в `stripeGateway.ts` на экспорте: fake `createPaymentIntent` → `{ id: 'pi_e2e_<bookingId>', clientSecret: 'cs_test_e2e' }`, fake `createRefund`, и **`retrieveClientSecret` возвращает fake-секрет для refs с префиксом `pi_e2e_`** (иначе confirmation-страница не отрендерит `DepositPayment`). Prod-путь не задет: без переменной поведение байт-в-байт прежнее.
- **Детерминизм (clarify Q2):** уникальные slug (`svc-e2e-<ts>-<rand>`) + hour-бакеты (канон int-тестов) на dev-БД; seed ТОЛЬКО через Payload Local API (`overrideAccess: true`).
- **OTP:** исключительно `getOtpCodeFromDb(payload, intentId)` — intentId берётся из состояния UI/ответа 202; никаких 6-значных регекспов на сетевом слое.
- **Локаторы:** `data-testid` из DOM-фактов; никаких guessed-селекторов (урок GUI QA: кириллические role-локаторы чекбоксов — через testid + programmatic click при необходимости).
- **Граница с int:** браузерные тесты не перепроверяют валидации домена — только интеграцию UI→API→FSM→БД→surfaces (Via Negativa).

## Implementation Phases

Phase 1 — Infra (1d)

- env-гейт fake-gateway (T1501), baseURL (T1502), `seed-booking.ts` fixture (T1503)

Phase 2 — P0 tests (2.5d)

- `composite-booking.e2e.spec.ts`: journey + кэш-изоляция + composite 409 race (T1510)
- `money-surfaces.e2e.spec.ts`: DepositPayment Σ + absence + legacy itemId-fallback (T1511, зависит от T1501)

Phase 3 — P1 tests (1.5d)

- `token-pages.e2e.spec.ts`: cancel + reuse-409 + composite-reschedule + acknowledge (T1520)
- `trust-fast-path.e2e.spec.ts`: no-OTP повтор + mismatch→OTP (T1521)

Phase 4 — P2 tests (1d, опционально к MVP)

- `waitlist-admin-i18n.e2e.spec.ts` (T1530)

Phase 5 — Verify & Docs (1d)

- RTM-lite + README e2e-секция (T1540); полный `pnpm test` + флейк-аудит + speed budget (T1541)

## Risks

| Риск | Вероятность | Митигация |
| --- | --- | --- |
| Флейк из-за общей dev-БД (чужие брони в бакете) | Средняя | Уникальные hour-бакеты на прогон + retries CI×3 + trace on-first-retry |
| Зависание dev-бута в webServer (наблюдается на Windows) | Низкая/Средняя | reuseExistingServer (уже) + pre-launch health-check curl в helper |
| Fake-gateway протечёт в prod | Низкая | Гейт только по env-переменной; тест «без E2E_GATEWAY путь прежний» в int? (нет — чисто e2e-инфра; проверка код-ревью) |
| Turbopack HMR-зомби (урок 014 GUI QA) | Средняя | В README e2e-секции: `netstat+taskkill //T //F` при EADDRINUSE; webServer reuse |

## Next

`/speckit.tasks` → tasks.md (dependency graph, lanes, dispatch) → analyze → ×2 external review → implement.
