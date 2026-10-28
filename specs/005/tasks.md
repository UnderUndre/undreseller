# Tasks: 005 (005-stripe-adapter-and-sovereign-auth)

> "Never half-ass two things. Whole-ass one thing." — Рон Свонсон (_Parks and Recreation_)
> "Чё там с сосисками, Чарли? — Пять минут." — _Большой куш_ (о дейликах)
> "Первые 90% проекта занимают 90% времени." — The 90-90 rule

**Input**: Design documents from `/specs/005/` (spec.md rev 2.2, plan.md, research.md, data-model.md, contracts/stripe-adapter.md, quickstart.md, qa/preliminary-rtm.md)
**Prerequisites**: plan.md, spec.md (Stories 1–6), requirements-audit PASS

**Organization**: Phase per story: US1 auth-hardening (P0) → US2 Stripe (P0, Critical-risk) → US3 zod@4 (P0 debt) → US4 API consolidation (P1) → US5 polish (P1) → US6 orphan cleanup (P1). MVP = US1 + US2.

## Format: `[ID] [AGENT] [Story?] Description`

## Agent Tags

| Tag | Agent | Domain |
| --- | --- | --- |
| `[SETUP]` | orchestrator | deps, supply chain, CI-гейты, closeout |
| `[DB]` | database-architect | schema, миграции, backfill, вычистка |
| `[BE]` | backend-specialist | сервисы, адаптеры, API + юнит-тесты |
| `[FE]` | frontend-specialist | UI, i18n-поверхности |
| `[E2E]` | test-engineer | контрактные/сквозные сьюты |
| `[OPS]` | devops-engineer | runbook, миграционные пруфы |
| `[SEC]` | security-auditor | STRIDE-верификация |
| `[PERF]` | performance-optimizer | бенчмарки |

---

## Phase 1: Setup — Supply Chain & Gates (sync barrier)

- [ ] T001 [SETUP] Supply chain: add `stripe` + `@node-rs/argon2` (exact-pin) to `package.json`; registry entries in `config/oss-reuse-registry.json`; `node scripts/verify-licenses.mjs` PASS; `npm audit` — зафиксировать текущий бейзлайн (2 high = zod, снимется в T041). NOTE: zod bump живёт в T041, НЕ здесь (код ещё на 3.x API)
- [ ] T002 [SETUP] CI-гейт orphan-моделей: job/скрипт `rg -n "\b(Offering|OfferingVariant|ServicePolicy|BundleComponent|InventoryBalance|InventoryMovement|OrderLine|PaymentPlan|PaymentMilestone|PaymentAllocation|FulfillmentPlan|FulfillmentSegment|CompletionEvidence|OperatorAction)\b" app lib scripts components` → 0 (fail иначе); wire в CI рядом с дизайн/i18n-гейтами

---

## Phase 2: Foundational (blocking prerequisites, sync barrier)

- [ ] T010 [DB] Expand-миграция `prisma/migrations/20261101000000_005_stripe_and_hardening/` (+`down.sql`): `user.sessionEpoch INT NOT NULL DEFAULT 1`, `session.epochCreated INT NOT NULL DEFAULT 1`, `account.passwordAlgo TEXT`, `CREATE TYPE "StaffRejectNotifyMode"` + колонка `ShopSettings.staffRejectNotifyMode` (default NOTIFY_CUSTOMER), `ALTER TYPE "RefundOperationKind" ADD VALUE 'STRIPE'` (F1); `prisma/schema.prisma` + guard-тест в lineage `tests/unit/db-gist-and-migration.test.ts` (timeout-guards, down дропает только новое)
- [ ] T011 [DB] Idempotent backfill `scripts/backfill-005-reject-notify-mode.ts` (env `STAFF_REJECT_NOTIFY_MODE` → колонка, rate-limited batches) + юнит-тест
- [ ] T012 [BE] Argon2-фундамент `lib/security/argon2.ts`: hash/verify через `@node-rs/argon2`, параметры из env (`ARGON2_M_KIB/T/P`) с захардкоженным полом (≥19456 KiB, ≥2 iter), PHC-строки, **мьютекс ≤1 операции (verify+hash) на процесс с лимитом очереди ≤10 и таймаутом 5000мс → HTTP 503** (F6); юнит-тесты: раунд-трип, пол параметров (низкие → throw), сериализация, отлуп 503 при переполнении очереди
- [ ] T013 [BE] `lib/security/staffSessions.ts`: `revokeAllStaffAccess(userId, cause)` (epoch+1, session.deleteMany, аудит-событие) + `resolveStaffSession` проверка `epochCreated === sessionEpoch` (Model A); юнит-тесты incl. гонка «сессия создана между инкрементом и deleteMany → отвергнута»

**Checkpoint**: схема расширена, Argon2 и epoch-механика готовы.

---

## Phase 3: US1 — Auth Hardening (P0) 🎯 MVP

**Goal**: Argon2id-пере-хеш, мгновенный отзыв, per-IP bruteforce, auth-обсервабилит (FR-501..505).
**Independent Test** (spec §7.1): логин владельца без смены пароля (scrypt→argon2id прозрачно); увольнение OPERATOR режет живую сессию ≤1 запрос; 6-я попытка с одного IP → 429.

- [ ] T020 [BE] [US1] `lib/security/staffSignIn.ts`: при логине `passwordAlgo != "argon2id"` → verify scrypt → при успехе пере-хеш Argon2id + маркер; сессия пишется с `epochCreated = user.sessionEpoch`; юнит-тесты (legacy-пароль проходит и пере-хешируется, битый хеш → INVALID, PHC-параметры из env)
- [ ] T021 [BE] [US1] Per-IP anti-bruteforce на `/api/auth/sign-in`: расширение `lib/security/rateLimit.ts` (функции `recordAuthFailure` / `isIpLockedOut` с двухфазным окном F7: 5 неудач / 15 мин → блок 30 мин Retry-After, успешный логин не штрафуется), независимо от per-account lockout 004; юнит-тесты (4/5/6 попыток, второй IP не блокируется, независимость двух лимитов)
- [ ] T022 [BE] [US1] Auth-обсервабилит FR-505: расширить `STAFF_SIGN_IN`/`STAFF_SIGN_IN_FAILED`, добавить `STAFF_ACCOUNT_LOCKED`, `STAFF_IP_RATE_LIMITED`, `STAFF_SESSIONS_REVOKED` (cause: deactivated|role_change|compromise; PII-redacted, IP только /24); юнит-тест «ровно один event на действие» + zero-PII скан
- [ ] T023 [BE] [US1] Интеграция отзыва: deactivate/role-change в admin staff API (`app/api/admin/staff/*`) → `revokeAllStaffAccess`; тесты (увольнение режет живую сессию ≤1 запрос)
- [ ] T024 [PERF] [US1] Argon2 микро-бенчмарк (FR-504a/NFR-5): 5 последовательных логинов + живой TG-поллер, `process.memoryUsage().rss` до/после, пик ≤500 MB → evidence `specs/005/evidence/argon2-benchmark.md` **до merge фазы**; при превышении — снижение env-параметров до пола и повторный замер (число фиксируется)

**Checkpoint**: auth-контур захардничен, бенчмарк-гейт зелёный.

---

## Phase 4: US2 — Stripe Adapter (P0, Critical risk) 🎯 MVP

**Goal**: Stripe за контрактом 004, дедуп InboxEvent, FSM-маппинг, отказоустойчивость (FR-510..516).
**Independent Test** (spec §7.2, quickstart): stubbed-цикл book → Checkout URL → webhook completed → BOOKED + PaymentAllocationLink; replay ×100 → 1 эффект; refunded → CANCELLED + RefundOperation.

- [ ] T030 [BE] [US2] `lib/payments/stripe.ts` + `app/api/checkout/route.ts` (F2, F4): адаптер `PaymentProvider` (createInvoice: TTL = `PREPAID_HOLD_TTL_MS`/1000 = 15 мин, dashboard-driven — БЕЗ payment_method_types, line_items в registry minor units, Idempotency-Key `inv_<orderId>`; verifyCallback через SDK constructEventAsync; parseCallback → CallbackStatus с `providerPaymentId = session.payment_intent pi_...`); саморегистрация `registerPaymentProviderFactory("STRIPE")`; сквозная интеграция чекаута: side-effect импорт stripe в `app/api/checkout/route.ts`, расширение `checkoutSchema.paymentMethod` (`STRIPE`/`CARD`), диспетчеризация вызова `createInvoice` по выбранному провайдеру; юнит-тесты incl. BVA TTL (14.9–15.1 мин) и JPY(0)/KWD(3)
- [ ] T031 [BE] [US2] `lib/payments/stripeWebhook.ts` + `app/api/payments/stripe/webhook/route.ts` (thin, raw `req.text()`): **дедуп InboxEvent и FSM-переход строго внутри единой атомарной транзакции `prisma.$transaction`** (F3, исключает потерю оплат при сбое FSM) → FSM §3 (completed → BOOKED/PAID + PaymentAllocationLink с `pi_...`; expired → RELEASED при живом незафриженном холде; payment_failed → без смены статусов + TG-напоминание; charge.refunded → RefundOperation(kind: STRIPE, actor: stripe_dashboard) + CANCELLED); invalid signature → 401 zero-processing
- [ ] T032 [E2E] [US2] Контрактный сьют `tests/unit/stripe-contract.test.ts` по ПОНОЙ матрице `contracts/stripe-adapter.md` §4: конкурентный залп `Promise.all(Array.from({length:100}, ...))` → 1 эффект/99 deduplicated; гонка expired-после-completed; freeze-канон; Decision Table (4 события × статусы) + State Transition
- [ ] T033 [BE] [US2] FR-511a отказ Stripe при createInvoice: сессия ДО холда; 5xx/timeout → холд не ставится, HTTP 503 + retry-сообщение, аудит `STRIPE_INVOICE_FAILED`; повтор с тем же Idempotency-Key безопасен; юнит-тесты (все классы ошибок SDK)
- [ ] T034 [FE] [US2] Checkout UI: при ≥2 включённых провайдерах — выбор способа (карта/крипта/Stars), при 1 — прямой путь; i18n-ключи ru/en (+uk из T061 позже); кнопка ведёт на `paymentUrl` адаптера; **обработка возврата клиента (F9):** `app/checkout/page.tsx` рендерит подтверждение бронирования для заказов со статусом PAID/BOOKED вместо 404 notFound()

**Checkpoint**: money-path Stripe закрыт контрактом ×100.

---

## Phase 5: US3 — zod@4 Migration (P0 debt)

**Goal**: последний audit-high снят, контракты 400 не дрогнули (FR-520..522).
**Independent Test** (spec §7.3): `npm audit` 0 H/C; jest зелёный; снапшоты форм ошибок идентичны.

- [ ] T040 [SETUP] [US3] Characterization-снапшоты ДО: формы 400-ответов booking create, adminSchemas, presign (`tests/unit/api-error-shapes.snapshot.test.ts`) — фиксируют текущие `flatten()`-формы на zod 3
- [ ] T041 [BE] [US3] zod 3.25 → 4.x (exact-pin в `package.json`): механическая миграция по changelog (z.record сигнатура, error.flatten→z.flattenError, strict/passthrough→strictObject/looseObject, coerce); весь код + `lib/validation/adminSchemas.ts`; `npx tsc --noEmit` + полный jest зелёные; `npm audit` → 0 High/Critical (evidence в tasks-коммит)
- [ ] T042 [BE] [US3] Снапшоты ПОСЛЕ: идентичны снапшотам T040 (FR-522); расхождение = блокер merge

**Checkpoint**: supply chain чист (0 H/C).

---

## Phase 6: US4 — Booking API Consolidation (P1 debt)

**Goal**: один booking-эндпоинт (FR-530/531).
**Independent Test** (spec §7.4): старый URL → 308; поведение обоих путей идентично до Sunset.

- [ ] T050 [BE] [US4] `/api/booking` поглощает логику `/api/booking/lock` (единый zod-контракт, единая conflict-проверка GiST/23P01→409, один источник буферов); контракт-тесты обоих путей идентичны по эффектам
- [ ] T051 [BE] [US4] Старый путь: 308 + `Deprecation: true` + `Sunset: <деплой+90d>` (дата вычисляется при деплое, placeholder-конфиг); контракт-тест заголовков; TODO-маркер «410 в релизе после Sunset, ≤006»

---

## Phase 7: US5 — Polish Pack (P1)

**Goal**: D3–D5 (FR-540..542).
**Independent Test** (spec §7.5): политика переключается в админке без рестарта; uk-гейт PASS; KWD на витрине — 3 decimals.

- [ ] T060 [BE] [US5] FR-540: чтение reject-политики из `ShopSettings.staffRejectNotifyMode` (замена env) в staff-actions + PATCH в settings API (OPERATIONAL, OPERATOR+) + переключатель в `/admin/settings`; тесты 3 режимов на серверном уровне
- [ ] T061 [FE] [US5] FR-541: `messages/uk.json` (ICU few/many, паритет ключей), `node scripts/i18n-coverage-gate.mjs --locales ru,en,uk` PASS; LocaleSwitcher и отдача uk ⇔ `ShopSettings.enabledLocales` содержит `uk` (управление — OWNER через `/admin/settings`, foundation-раздел локалей); юнит-тесты паритета + тест «uk в enabledLocales → доступна; убрали → недоступна»
- [ ] T062 [BE] [US5] FR-542: `formatMinor(amountMinor, currency)` в `config/currency-registry.ts` (CurrencyMetadata.minorUnit); замена форматирований в каталоге/чекауте/админке/бот-карточках (вместо assumptions 2 decimals); BVA-тесты (JPY 0/KWD 3/USD 2, 0/1/max)

---

## Phase 8: US6 — Orphan Model Cleanup (P1)

- [ ] T070 [DB] [US6] FR-550: удалить 14 schema-only моделей + неиспользуемые enum'ы и **поля связей `orderLines/paymentPlan/fulfillmentPlan` из `model Order`** (F5) в `prisma/schema.prisma` (SQL-миграции НЕТ — таблиц не существовало); `npx prisma generate` + `npx tsc --noEmit` зелёные; `rg`-гейт (T002) = 0; `npx prisma migrate dev` на чистой scratch-базе без P2021 (evidence в tasks-коммит)

---

## Phase 9: Polish & Cross-Cutting (sync barrier — все US)

- [ ] T080 [SEC] STRIDE-верификация 005 по plan-матрице: подделка stripe-signature (чужой секрет/отсутствие/replay), Idempotency-Key коллизии, PII-скан auth-логов (ноль секретов, IP /24), лицензии новых deps + финальный `npm audit`; находки — фикс или документирование
- [ ] T081 [OPS] Runbook: `docs/whitelabel-quickstart.md` §12 (Stripe setup: test/prod ключи, регистрация домена для кошельков, PAYMENT_PROVIDERS; Argon2 env-тюнинг; reject-notify переключатель; Sunset-расписание 308→410) + down-migration прогон `down.sql` на scratch (пруф в evidence)
- [ ] T082 [E2E] Quickstart tracer bullet полный прогон (5 шагов `quickstart.md`) на Stripe test-ключах локально; результаты — `specs/005/evidence/quickstart-tracer.md`
- [ ] T083 [SETUP] Stage closeout: evidence-файлы собраны, `tasks.md` статусы, подготовка `/speckit.analyze`; краткая retro-заметка (branch-naming IX lineage)

---

## Dependency Graph

```
T001 → T002, T010, T030
T002 + T010 → T070
T010 → T011, T013
T012 → T020
T013 → T023
T020 → T024
T030 → T031, T033
T031 → T032
T030 → T034
T032 → T080
T024 → T080
T034 → T040
T040 → T041
T041 → T042
T041 → T060
T050 → T051
T032 + T024 + T042 + T051 → T082
T080 + T081 → T083
T033 + T060 → T081
T082 + T070 → T083
```

### Self-Validation Checklist

- [x] Every task ID referenced exists above
- [x] No circular dependencies
- [x] No orphan IDs
- [x] Fan-in `+` only, fan-out `,` only
- [x] No chained arrows on a single line

Примечания к порядку: `T041 → T060` (settings-API трогает zod-схемы — после миграции); `T034 → T040` (Stripe-UI завершает zod-поверхность до characterization); `T010 → T070` формализовано ребром — оба пишут `schema.prisma` (shared file), DB-агент один, но барьер явный.

---

## Parallel Lanes

| Lane | Agent Flow | Tasks | Blocked By |
| ---- | ---------- | ----- | ---------- |
| 1 | [SETUP] supply chain | T001 → T002 | — |
| 2 | [DB] schema | T010 → T011 | T001 |
| 3 | [BE] auth | T012 → T020 → T021/T022 → T023 → T024 | T010, T012 |
| 4 | [BE/FE/E2E] stripe | T030 → T031 → T032; T030 → T033, T034 | T001 |
| 5 | [SETUP/BE] zod | T040 → T041 → T042 | T034 |
| 6 | [BE] api-consolidation | T050 → T051 | — |
| 7 | [BE/FE] polish | T060, T061, T062 | T041 (только T060) |
| 8 | [DB] orphan cleanup | T070 | T002 |
| 9 | [SEC/OPS/E2E] close | T080, T081, T082 → T083 | lanes 3–8 |

---

## Agent Summary

| Agent | Tasks | Can Start After |
| ----- | ----- | --------------- |
| [SETUP] | 4 (T001, T002, T040, T083) | immediately |
| [DB] | 3 (T010, T011, T070) | T001 / T002 |
| [BE] | 15 (T012, T013, T020–T023, T030, T031, T033, T041, T050, T051, T060, T062) | lane deps |
| [FE] | 2 (T034, T061) | T030 / — |
| [PERF] | 1 (T024) | T020 |
| [E2E] | 2 (T032, T082) | T031 / all |
| [SEC] | 1 (T080) | T032+T024 |
| [OPS] | 1 (T081) | T033+T060 |

**Critical Path**: T001 → T030 → T031 → T032 → T080 → T083 (Stripe money-path; параллельная ветка auth: T001 → T010 → T012 → T020 → T024 → T082 → T083 — та же длина).

**Total**: 29 задач.

---

## Agent Dispatch Plan

| Agent | Subagent/Command | Skills | Input Context | Tasks | Files |
| ----- | ---------------- | ------ | ------------- | ----- | ----- |
| `[SETUP]` | orchestrator | architecture, clean-code | plan §Technical Context, research D1 | T001, T002, T040, T083 | `package.json`, `config/oss-reuse-registry.json`, CI, evidence/ |
| `[DB]` | database-architect | database-design, prisma-expert, clean-code | data-model (полный) | T010, T011, T070 | `prisma/`, `scripts/` |
| `[BE]` | backend-specialist | api-patterns, nodejs-best-practices, typescript-expert, clean-code | contracts/stripe-adapter.md, spec §3–4, research D1–D4 | T012, T013, T020–T023, T030, T031, T033, T041, T050, T051, T060, T062 | `lib/`, `app/api/` |
| `[FE]` | frontend-specialist | react-patterns, nextjs-best-practices, i18n-localization | contracts/stripe-adapter.md §2, spec FR-541 | T034, T061 | `components/`, `messages/` |
| `[PERF]` | performance-optimizer | performance-profiling | spec FR-504a/NFR-5, plan §Observability | T024 | evidence/ |
| `[E2E]` | test-engineer | testing-patterns, tdd-workflow | contracts §4 (матрица), quickstart.md | T032, T082 | `tests/unit/`, evidence/ |
| `[SEC]` | security-auditor | vulnerability-scanner, code-review-checklist | plan §STRIDE | T080 | project-wide |
| `[OPS]` | devops-engineer | deployment-procedures, bash-linux | plan §Observability, spec FR-530 | T081 | `docs/` |

---

## Implementation Strategy

**MVP First**: US1 + US2 (auth-hardening + Stripe) — релизный контур 005; US3 (zod) — тем же релизом сразу после Stripe-UI (снапшот-гейт); US4–US6 — долговая часть, параллелится.

**Incremental Delivery**: каждый чекпоинт фазы = зелёные гейты (tsc/eslint/jest не падают ниже 367 тестов) + коммит «BE/FE/E2E: T0xx …» с отметкой `[X]` в этом файле.

**Parallel Agent Strategy**: lanes 2–4 стартуют после T001; lane 5 (zod) — строго после T034 (заморозка zod-поверхности); schema.prisma — единственный shared-file, оба писателя [DB] последовательны (T010 → T070). Constitution VI: implement заблокирован до analyze PASS + ≥2 внешних ревью PASS.

## Notes

- Тесты в каждой задаче — TDD-Lite (тест до/сразу после), канон coding-standards: никаких `as any`/`console.log`/raw SQL.
- NFR-5 бенчмарк-гейт: T024 обязан быть merged с evidence-файлом, иначе фаза US1 не закрывается.
- Snapshot: `tasks/005/v1` этим коммитом (Principle VII; якорь для `/speckit.retrospective`).
