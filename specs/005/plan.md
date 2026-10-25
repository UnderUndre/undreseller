# Implementation Plan: 005 (005-stripe-adapter-and-sovereign-auth)

> "Тяжесть — это надёжно. Даже если не стрельнёт, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)
> "These walls are funny. First you hate 'em, then you get used to 'em." — _Побег из Шоушенка_
> "Scissors cuts paper, paper covers rock — Распределённый дедлок в микросервисах." — Шелдон Купер

**Branch**: `005` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md) (rev 2.2, requirements-audit PASS)
**Input**: `specs/005/spec.md` + `requirements-audit.md` + `qa/preliminary-rtm.md` (27 требований; 3 Critical)

## Summary

Фиат-рельс + харднинг + долговая зачистка поверх монолита 004, без новой топологии: (1) **Stripe Hosted Checkout** — третий адаптер за провайдер-нейтральным контрактом 004 (dashboard-driven методы, TTL = hold-TTL 15 мин, сессия до холда, дедуп InboxEvent, возвраты через Dashboard → RefundOperation); (2) **auth-харднинг** — Argon2id с прозрачным пере-хешем scrypt, `sessionEpoch`-отзыв (Model A), per-IP anti-bruteforce, auth-обсервабилит; (3) **tech-debt** — zod 3→4 (последний audit-high), консолидация `/api/booking/lock` → `/api/booking` (308/410), `staffRejectNotifyMode` env→DB, uk-локаль, `formatMinor` (JPY/KWD), вычистка 14 schema-only моделей 003 (P2021-мина). Ноль новых таблиц, одна аддитивная миграция, лимит ≤500 MB RSS ненарушим (Argon2 сериализуется + бенчмарк-гейт).

## Technical Context

**Language/Version**: TypeScript 5.8, Node 22 (alpine), Next.js 15.5 App Router — без изменений.
**Primary Dependencies**: существующий стек 004 + **новые**: `stripe` (официальный SDK, MIT, exact-pin), `@node-rs/argon2` (prebuilt binaries, Apache-2.0/MIT). **Обновление**: `zod` 3.25 → 4.x exact-pin. Удалений deps нет.
**Storage**: PostgreSQL 16 / Prisma — единственная ORM. Изменения: `User.sessionEpoch`, `Session.epochCreated`, `Account.passwordAlgo`, `ShopSettings.staffRejectNotifyMode` (+enum), удаление 14 schema-only моделей (без SQL — таблиц не существует).
**Testing**: Jest 29 + ts-jest (unit/contract; сейчас 50 suites/367 tests — не ломать), снапшоты форм 400-ошибок (новое), Argon2-бенчмарк (evidence-файл).
**Target Platform**: Docker `node:22-alpine`, Hetzner CPX42, `REPLICA_COUNT=1`, Traefik v3.
**Project Type**: web-монолит (тот же).
**Performance Goals**: ≤500 MB RSS включая Argon2-пики (сериализация ≤1 оп/процесс); p95 инстанса не деградирует (Stripe-вызовы только в booking-пути prepaid, уже асинхронно-замороженный путь 004).
**Constraints**: ≤500 MB RSS (бизнес-план), GDPR-рынок, solo-dev, Expand/Contract (Constitution X), kanon 004 (thin controllers, deny-list logger, minor units).
**Scale/Scope**: white-label ≤ ~200 items / ≤ ~20 staff / ≤ ~2k bookings/мес — без изменений.
**Security Surface & STRIDE Triggers**: новый сетевой эндпоинт (Stripe webhook) + crypto (Argon2id, stripe-signature) + money-path → STRIDE-матрица ниже, обязательна.
**Database Migration Trigger**: схема модифицируется → 4-фазный манифест в data-model.md §3.
**Supply Chain & Licensing**: `stripe` MIT, `@node-rs/argon2` MIT/Apache-2.0 → реестр `config/oss-reuse-registry.json`; `verify-licenses.mjs` PASS; `npm audit` **0 High/Critical** после zod@4 (NFR-3).
**Research Spikes & Disposal**: 0 спайков — обоснование в research.md (контракт 004 валидирован, SDK официальный, бенчмарк = acceptance-гейт, не спайк). Constitution XI: нет прототипов → нет утилизации.

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I. Source of Truth | PASS | `.claude/` не затрагивается |
| II. Transformer, Not Fork | N/A | нет новых AI-таргетов |
| III. Protected Slots | N/A | |
| IV. SemVer 0.x | PASS | приватное приложение |
| V. Token Economy | PASS | новых агентов/скиллов нет |
| VI. Cross-AI Review | ON TRACK | гейт перед implement: analyze + ≥2 внешних ревьюера (прецедент-флоу 004) |
| VII. Artifact Versioning | PASS | теги `requirements-audit/005/v1` ✅; `plan/005/v<N>` этим коммитом; snapshot-скрипт уже патчит новые стейджи |
| VII-B. Business Plan | PASS | v18.8 (2026-10-26): Stripe = capability Sprint B, SKU/цены не меняются; спека не нарушает гейты |
| VIII. Self-Maintaining | PASS | architecture.md обновляется (§Project Structure ниже) |
| IX. Two-Phase | DEVIATION (та же, что 004) | branch `005` на месте `specs/<slug>`-ветки — grandfathered lineage репо, в retro |
| X. Expand/Contract | PASS | манифест data-model.md §3; D6 = Contract-фаза без SQL (таблиц нет) |
| XI. Spike Governance | PASS | 0 спайков, обосновано в research.md |
| XII. QA Contour | ON TRACK | requirements-audit PASS (v1) ✅; preliminary-rtm ✅; test-design — после tasks; qa-signoff — после staging |

## Project Structure

### Documentation (this feature)

```text
specs/005/
├── spec.md                 # rev 2.2 (audit PASS)
├── requirements-audit.md   # PASS (история REJECTED→PASS)
├── qa/preliminary-rtm.md   # 27 требований, 3 Critical
├── research.md             # D1–D6, 0 спайков
├── data-model.md           # 4 колонки + enum + orphan-cleanup, Expand/Contract
├── contracts/stripe-adapter.md
├── quickstart.md           # 5-шаговый трейсер
└── plan.md                 # этот файл
```

### Source (изменения)

```text
lib/
├── payments/stripe.ts              # NEW: адаптер (createInvoice/verifyCallback/parseCallback)
├── payments/stripeWebhook.ts       # NEW: FSM-обработка 4 событий (thin, переиспользует 004)
├── security/staffSignIn.ts         # MOD: Argon2id пере-хеш + epochCreated + auth-события
├── security/staffAuth.ts           # MOD: resolveStaffSession проверяет epochCreated
├── security/staffSessions.ts       # NEW: revokeAllStaffAccess (epoch+deleteMany)
├── security/rateLimit.ts           # MOD: per-IP слайдинг-окно на /api/auth/sign-in
├── config/currency-registry.ts     # MOD: formatMinor(amountMinor, currency)
app/
├── api/payments/stripe/webhook/route.ts  # NEW
├── api/booking/route.ts            # MOD: поглощает lock-логику (канон)
└── api/booking/lock/route.ts       # MOD: 308 + Sunset (затем 410 ≤006)
messages/uk.json                    # NEW (data-only)
prisma/schema.prisma                # MOD: +4 поля, +enum, −14 orphan-моделей
prisma/migrations/20261101000000_005_stripe_and_hardening/
scripts/backfill-005-reject-notify-mode.ts
```

## Threat Modeling (STRIDE)

| Категория | Цель | Вектор | Контрмера |
|---|---|---|---|
| **S**poofing | Stripe webhook; staff-логин | Подделка event/сигнатуры; password-stuffing | `stripe-signature` HMAC timing-safe (SDK) + raw body; per-IP 5/15мин + per-account lockout 004 + Argon2id |
| **T**ampering | Суммы/валюта; metadata orderId | Подмена line_items/metadata | Суммы сверяются с квотой заказа в registry minor units (как NOWPayments 004); orderId из metadata валидируется против БД |
| **R**epudiation | Платежи/возвраты; auth-действия | «платежа не было»/«это не я логинился» | InboxEvent (event.id) + PaymentAllocationLink + RefundOperation — неизменяемый аудит; FR-505 auth-события |
| **I**nformation Disclosure | Логи auth; audit | Утечка паролей/токенов/IP | deny-list logger (004) + FR-505: ноль секретов, IP только /24 |
| **D**enial of Service | Вебхук-шторм; Argon2-пики | replay-флуд; параллельные логины | дедуп первым шагом (O(1)); условные переходы (no-op на реплеях); Argon2-мьютекс ≤1/процесс |
| **E**levation | Вебхук как командный канал | event → сменить роль/создать админа | вебхук не несёт авторизационных решений; только FSM-переходы по §3 спеки |

## Database Migration Strategy

Манифест — data-model.md §3 (Expand 20261101000000 / backfill reject-notify / cutover кодом / contract = D6-схема + удаление lock-route). Rollback: down.sql (только новые объекты) + `PAYMENT_PROVIDERS` без STRIPE (zero-provider 004) + git-revert схемы. Enum ADD не задействован (новый тип, а не ADD VALUE) — down.sql полон.

## Observability, Recovery & Rollback

- **Метрики/логи**: auth-события FR-505 (PII-redacted); `STRIPE_INVOICE_FAILED`, webhook accept/dedup счётчики — через существующий deny-list logger; нулевой PII-скан (lineage SC-403).
- **Бенчмарк-гейт (NFR-5)**: Argon2 микро-бенчмарк — evidence-файл в спеку ДО merge задачи FR-501/504a.
- **Health**: `/api/health` без изменений (Stripe — внешний SaaS; недоступность видна как 503 в booking-пути, алертить нечем на free-тарифе — фиксируется ops-заметкой в runbook).
- **DR**: RTO/RPO неизменны; вебхуки — Stripe ретраит до 3 суток (FLP-механика), дедуп гарантирует ровно один эффект.
- **Rollback-триггеры**: деградация p95 booking >2×, двойные эффекты платежей, auth-регрессии на логине. Процедура: флаг `PAYMENT_PROVIDERS` без STRIPE → revert образа → down.sql при необходимости.

## Risks & Complexity Tracking

| Риск | Вероятность | Митигация |
|---|---|---|
| zod@4 ломает форму ошибок API | средняя | FR-522 снапшоты до/после — блокер merge |
| Argon2-пик бьёт 500 MB | низкая | сериализация + env-пол + бенчмарк-гейт FR-504a |
| Stripe test/prod расхождение методов | низкая | dashboard-driven; трейсер quickstart на test-ключах |
| Orphan-модели кем-то импортируются после вычистки | низкая | rg-гейт в CI (FR-550) |

Нарушений конституции, требующих justification-таблицы, нет (IX — тот же grandfathered, что 004).

## Next

`/speckit.tasks` → распил на задачи по Stories 1–6 с трассировкой preliminary-RTM (Critical: FR-511/FR-514/FSM-§3 → обязательные DT+STM+Exploratory+UAT в test-design).
