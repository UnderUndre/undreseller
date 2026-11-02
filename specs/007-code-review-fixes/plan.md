# Implementation Plan: 007 (007-code-review-fixes)

> "Правильный фикс — тот, который не тянет за собой рефактор." — Инженерное фольклóр
> "Fail-closed — это не паранойя, это гигиена." — Валера

**Branch**: `main` (single-branch lineage, grandfathered IX) | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md) (rev 1.2, review remediation F1–F6 integrated)
**Input**: `specs/007-code-review-fixes/spec.md` + `requirements-audit.md` (PASS) + `qa/preliminary-rtm.md` (11 reqs, 0 critical) + `research.md` (D1–D6)

## Summary

Восемь точечных фиксов по находкам code review + security-audit чеклисту с закрытием находок внешнего ревью F1–F6, поверх кодовой базы 003–006, без новой архитектуры: (1) fail-closed секреты (reschedule-HMAC throw + 503 с `answerCallbackQuery`; delivery-log соль `UNHASHED` + boot-алерт; `verifyMagicRescheduleToken` typings); (2) честный 501 на RESCHEDULE admin-роута; (3) provider-aware инвариант суммы в `fulfillPayment` (`TELEGRAM_STARS` XTR vs фиат; `STRIPE` динамическая валюта из сессии; `CRYPTO_GATEWAY`); (4) `AbortSignal.timeout(10s)` на 3 исходящих fetch с немедленным break retry-цикла в WhatsApp client; (5) lockout registry bounded (`userExists` guard, TTL 15 мин, hard-cap 1000 с вытеснением `min(lockedUntil)` при насыщении); (6) WhatsApp verify timing-safe со сравнением длины буферов `Buffer.byteLength`; (7) reconcile-окно GC-push 7 дней asc. **0 миграций, 0 новых deps, 0 изменений API-контрактов** (кроме 501/503 на нереализованное/несконфигурированное).

## Technical Context

**Language/Version**: TypeScript 5.8, Node 22 (alpine), Next.js 15.5 App Router — без изменений.
**Primary Dependencies**: без изменений (NFR-702: 0 новых deps; `AbortSignal.timeout` — stdlib Node 22).
**Storage**: PostgreSQL 16 / Prisma — **схема не модифицируется** (0 миграций; Expand/Contract N/A).
**Testing**: Jest 29 — regression-базовая линия 418 тестов / 51 сьют / 7 снапшотов 400-форм (канон 006 T050/T052); новые юнит-тесты на каждый FR (~15–18 шт.).
**Target Platform**: без изменений (Docker node:22-alpine, CPX42, REPLICA_COUNT=1).
**Project Type**: web-монолит (тот же).
**Performance Goals**: NFR-703 — RSS ≤500 MB при 5000 спрей-попыток sign-in (evidence `lockout-rss.json`); таймаут исходящих ≤10.5 с.
**Constraints**: fail-closed канон; timing-safe канон (length-guard до `timingSafeEqual`); minor units; дени-лист логгера; solo-dev.
**Scale/Scope**: white-label канон (≤200 items / ≤20 staff / ≤2k bookings/мес).
**Security Surface**: только сужение (fail-closed секреты, timing-safe, bounded память) — STRIDE-матрица 006 не расширяется; верификация T020.
**Database Migration Trigger**: отсутствует.
**Supply Chain**: без изменений (`npm audit` 0 H/C удерживается NFR-701).
**Research Spikes & Disposal**: 0 спайков (research.md D1–D6 — точечные правки по канонам).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I. Source of Truth | PASS | `.claude/` не затрагивается |
| II. Transformer, Not Fork | N/A | нет новых AI-таргетов |
| III. Protected Slots | N/A | |
| IV. SemVer 0.x | PASS | приватное приложение |
| V. Token Economy | PASS | новых агентов/скиллов нет |
| VI. Cross-AI Review | ON TRACK | гейт перед implement: analyze + ≥2 внешних ревьюера |
| VII. Artifact Versioning | PASS | `spec/007-code-review-fixes/v1,v2`, `requirements-audit/007-code-review-fixes/v1` ✅; `plan/…v1`, `tasks/…v1` этим коммитом |
| VII-B. Business Plan | PASS (waiver) | chore-only waiver (`business-plan-waiver.md`, VII-B.5); коммерческой дельты нет |
| VIII. Self-Maintaining | PASS | architecture.md §Feature Reference +007 |
| IX. Two-Phase | DEVIATION (та же) | single-branch lineage 004/005/006/007 — в retro |
| X. Expand/Contract | N/A | 0 миграций |
| XI. Spike Governance | PASS | 0 спайков |
| XII. QA Contour | ON TRACK | requirements-audit PASS ✅; preliminary-rtm ✅; test-design после tasks; qa-signoff после staging |

## Project Structure

### Documentation (this feature)

```text
specs/007-code-review-fixes/
├── spec.md                 # rev 1.1
├── requirements-audit.md   # PASS
├── business-plan-waiver.md # VII-B.5
├── checklists/requirements.md
├── qa/preliminary-rtm.md
├── research.md             # D1–D6, 0 спайков
├── plan.md                 # этот файл
├── tasks.md
└── evidence/               # lockout-rss.json и пруфы SC-001..005
```

### Source (изменения)

```text
lib/bot/magicReschedule.ts        # MOD: getRescheduleSecret throw + verifyMagicRescheduleToken error typing (FR-701)
app/api/bot/staff/webhook/route.ts # MOD: конфиг-ошибка → answerCallbackQuery + 503 (FR-701)
lib/notifications/deliveryLog.ts  # MOD: соль fail-closed → UNHASHED + boot-алерт (FR-702)
app/api/admin/bookings/[id]/route.ts # MOD: RESCHEDULE → 501 (FR-703)
lib/payments/providerContract.ts  # MOD: ParsedCallback.currency? (FR-704)
lib/payments/stripe.ts            # MOD: parseCallback извлечение currency (FR-704)
app/api/payments/stripe/webhook/route.ts # MOD: передача parsed.currency (FR-704)
lib/payments/fulfillment.ts       # MOD: provider-aware amount invariant (Stars XTR + Stripe/Crypto) → PAID_REQUIRES_RESOLUTION (FR-704)
lib/email/emailProvider.ts        # MOD: AbortSignal.timeout(10s) (FR-705)
lib/payments/nowpayments.ts       # MOD: AbortSignal.timeout(10s) (FR-705)
lib/bot/whatsappClient.ts         # MOD: AbortSignal.timeout(10s) + abort retry on timeout (FR-705)
lib/security/staffSignIn.ts       # MOD: lockout registry bounded (userExists, min(lockedUntil) eviction) (FR-706)
app/api/bot/whatsapp/webhook/route.ts # MOD: GET verify timing-safe Buffer.byteLength (FR-707)
lib/jobs/inngest.ts               # MOD: reconcile 7d asc take 50 (FR-708)
tests/unit/*.test.ts              # NEW: ~18–20 тестов
```

Каждый файл пишет один агент (нет shared-file конфликтов).

## Threat Modeling (STRIDE)

Сужение поверхности, новые векторов нет: S — подделка reschedule-ссылки с дефолтным ключом закрывается (FR-701); I — псевдо-псевдонимизация delivery-лога закрывается (FR-702); D — memory-DoS спреем sign-in закрывается (FR-706), зависшие upstream-вызовы ограничены 10 с (FR-705). Полная верификация — T020.

## Rollback

Git-revert по коммитам (1 задача = 1 коммит); миграций нет — откат мгновенный. Флагов не требуется: каждый фикс бинарно включён и покрыт тестом.

## Risks & Complexity Tracking

| Риск | Вероятность | Митигация |
|---|---|---|
| 501/503 ломает существующих клиентов | низкая | RESCHEDULE в UI не отправляется (кнопки нет); unconfigured-secret раньше был fail-open — валидные деплои не заметят |
| Amount invariant → ложные PAID_REQUIRES_RESOLUTION | нет | Provider-aware проверка: Stars сопоставляет XTR с расчётным starsPrice, Stripe динамически передаёт валюту из сессии |
| Eviction ослабляет брутфорс-защиту | нет | Неизвестные email отсекаются `userExists` guard; активный лок вытесняется только при аварийном переполнении 1000 записей по `min(lockedUntil)` |

Нарушений конституции, требующих justification-таблицы, нет (IX — тот же grandfathered).

## Next

`/speckit.tasks` → 10 задач, все параллелятся по файлам (единственный писатель на файл), closeout — sync barrier.
