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

- **Gateway-сеам (clarify Q1, fix AG-F1):** `E2E_GATEWAY=fake` читается в `stripeGateway.ts` на экспорте: fake `createPaymentIntent` → `{ id: 'pi_e2e_<bookingId>', clientSecret: 'pi_e2e_<bookingId>_secret_e2e' }` (**Stripe-формат clientSecret**), fake `createRefund`, `retrieveClientSecret` возвращает fake-секрет для `pi_e2e_`-refs. **`DepositPayment` получает fake-ветку** (`clientSecret.startsWith('pi_e2e_')` → рендер section/form/pay-button без `loadStripe()`/`<Elements>` — 0 ключей, 0 запросов к Stripe CDN; иначе компонент возвращает `null` без publishable key или крашится на не-Stripe формате). `E2E_GATEWAY=fake` пробрасывается через `webServer.env` в `playwright.config.ts`. Prod-путь не задет: без переменной поведение байт-в-байт прежнее.
- **Детерминизм (clarify Q2, fix AG-F3/F4):** уникальные slug (`svc-e2e-<ts>-<rand>`) через Payload Local API; **уникальные будущие ДАТЫ per test (`today + 2 + offset`), не hour-бакеты** — браузерный UI гранулярен по дате, nowMin не активен в любое время суток, слоты тестов не пересекаются на общем дефолтном ресурсе; weekly-hours 09:00–18:00 на все 7 дней; **rate-limit изоляция через `x-forwarded-for: 203.0.113.<n>` per BrowserContext** (RFC 5737 TEST-NET-3 — не loopback/internal, прод-`rateLimiter.ts` не трогается — иначе сьют сам себя забанит: RL_IP_MAX=10 интентов/10 мин на общий 127.0.0.1); `cleanup()` — точечный delete по ID в afterAll.
- **Prerequisite UI fixes (fix AG-F2/F4/F5):** баги живого 014-UI, блокирующие сьют, чинятся в Phase 1 (T1504): SlotGrid items-дублирование, confirmation lookup по `slot-reservations.id` (sequence-luck 404), `/book` без голых addOn, `[slug]` primary по slug-запросу; reschedule-прокидка `items_json` в пикер — в T1520.
- **OTP:** исключительно `getOtpCodeFromDb(payload, intentId)` — intentId берётся из состояния UI/ответа 202; никаких 6-значных регекспов на сетевом слое.
- **Локаторы:** `data-testid` из DOM-фактов; недостающие testid добавляются в `ConfirmCancelForm`/`ReschedulePicker`/`AcknowledgeClient`/`WaitlistJoinForm` (fix AG-F6); никаких guessed-селекторов.
- **Граница с int:** браузерные тесты не перепроверяют валидации домена — только интеграцию UI→API→FSM→БД→surfaces (Via Negativa).

## Implementation Phases

Phase 1 — Infra & prerequisite fixes (1.5d)

- env-гейт fake-gateway + DepositPayment fake-ветка (T1501), baseURL + webServer.env (T1502), `seed-booking.ts` fixtures — уникальные даты/XFF/cleanup (T1503), **prerequisite UI fixes (T1504): SlotGrid items-дублирование, confirmation lookup, `/book` addOn-фильтр, `[slug]` slug-запрос**

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
| Self-DoS rate-limiter на общем 127.0.0.1 (429 после 5-й брони) | Высокая без митигации | Уникальный `x-forwarded-for` TEST-NET-3 per BrowserContext (fix AG-F3) — прод-логика не тронута |
| Флейк из-за общей dev-БД | Средняя | Уникальные будущие ДАТЫ per test + `cleanup()` по ID + retries CI×3 + trace on-first-retry |
| Вечерние прогоны: nowMin отрезает слоты сегодняшней даты | Средняя | Уникальные будущие даты (не «сегодня») — nowMin не активен (fix AG-F4.2) |
| Зависание dev-бута в webServer (наблюдается на Windows) | Низкая/Средняя | reuseExistingServer (уже) + pre-launch health-check в helper |
| Fake-gateway протечёт в prod | Низкая | Гейт только по env-переменной; код-ревью T1501 |
| Turbopack HMR-зомби (урок 014 GUI QA) | Средняя | В README e2e-секции: `netstat+taskkill //T //F` при EADDRINUSE; webServer reuse |

## Next

`/speckit.tasks` → tasks.md (dependency graph, lanes, dispatch) → analyze → ×2 external review → implement.
