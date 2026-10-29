# Tasks: 006 (006-google-calendar-and-integrations)

> "Интеграция без идемпотентности — это генератор дублей с отложенной детонацией." — Валера
> "Чинить надо не там, где течёт, а там, где дырка." — Народная сантехническая мудрость

**Input**: Design documents from `/specs/006-integrations/` (spec.md rev 1.1, plan.md, research.md, data-model.md, contracts/gcal-adapter.md, contracts/outbound-webhooks.md, quickstart.md, qa/preliminary-rtm.md)
**Prerequisites**: plan.md, spec.md (Stories 1–4), requirements-audit PASS

**Organization**: Phase order (v2 re-sequencing 2026-10-29): **US4 zod@4 (P0 debt — ПЕРВЫМ, пока дифф-окно минимально: 0/22)** → US1 GC-sync (P0, Critical-risk, MVP) → US2 ICS (P2) → US3 webhooks/API (P3 — **пост-Demand Gate**, потребителей нет до форк-линии). MVP = US1.

## Format: `[ID] [AGENT] [Story?] Description`

## Agent Tags

| Tag | Agent | Domain |
| --- | --- | --- |
| `[SETUP]` | orchestrator | deps, supply chain, CI-гейты, closeout |
| `[DB]` | database-architect | schema, миграции |
| `[BE]` | backend-specialist | сервисы, адаптеры, API + юнит-тесты |
| `[FE]` | frontend-specialist | UI админки, i18n-поверхности |
| `[E2E]` | test-engineer | контрактные/сквозные сьюты |
| `[OPS]` | devops-engineer | runbook, миграционные пруфы |
| `[SEC]` | security-auditor | STRIDE-верификация |

---

## Phase 1: Setup — Supply Chain (sync barrier)

- [ ] T001 [SETUP] Supply chain: add `googleapis` (exact-pin) to `package.json`; registry entry in `config/oss-reuse-registry.json` (Apache-2.0); `node scripts/verify-licenses.mjs` PASS; `npm audit` — зафиксировать бейзлайн (2 high = zod, снимается в T051 — Phase 2, первым делом). NOTE: zod bump живёт в T051, НЕ здесь

---

## Phase 2: US4 — zod@4 Migration (P0 debt — выполняется ПЕРВЫМ) 🎯 SECURITY

**Goal**: последний audit-high снят ДО начала фичевого кода 006 — весь новый код интеграций пишется нативно на zod@4, без повторной миграции (FR-630..632).
**Independent Test** (spec US4): `npm audit` 0 H/C; jest зелёный; снапшоты форм ошибок идентичны.

- [ ] T050 [SETUP] [US4] Characterization-снапшоты ДО: формы 400-ответов booking create, adminSchemas, presign (`tests/unit/api-error-shapes.snapshot.test.ts`) — канон 005 T040. Скоуп снапшотов = существующая поверхность 004/005 (006-фичевый код ещё не написан — реверс исходного порядка T050-после-T024/T042)
- [ ] T051 [BE] [US4] zod 3.25 → 4.x exact-pin: механическая миграция по changelog (`z.record` сигнатура, `error.flatten` → `z.flattenError`, `.strict()/.passthrough()` → `z.strictObject/z.looseObject`, `coerce`); весь код + `lib/validation/adminSchemas.ts`; `npx tsc --noEmit` + полный jest зелёные; `npm audit` → 0 High/Critical (evidence в tasks-коммит); **NOTE: строгий атомарный коммит для безопасного git-revert при откате**. После merge — все фичевые задачи 006 используют zod@4 идиомы нативно
- [ ] T052 [BE] [US4] Снапшоты ПОСЛЕ: идентичны снапшотам T050 (FR-632); расхождение = блокер merge

**Checkpoint**: supply chain чист (0 H/C), zod@4 — базовая линия релиза.

## Phase 3: Foundational (blocking prerequisites, sync barrier)

- [ ] T010 [DB] Expand-миграция `prisma/migrations/20270201000000_006_integrations/` (+`down.sql`): `CREATE TABLE "IntegrationCredential"` (UNIQUE `(provider, resourceId)`, FK `Resource` с `onDelete: Cascade`), `"ExternalBusyBlock"` (UNIQUE `(calendarId, gcEventId)`, INDEX `(resourceId, startUtc, endUtc)`, FK `Resource` с `onDelete: Cascade`), `"WebhookEndpoint"` (`encryptedSecret`, `secretPrefix`, `failureCount`, `active`); `CREATE TYPE "IntegrationProvider"`, `"IntegrationStatus"`; `ALTER TABLE "Item" ADD COLUMN "remoteMeetingEnabled" BOOLEAN NOT NULL DEFAULT false`; `prisma/schema.prisma` + guard-тест в lineage `tests/unit/db-gist-and-migration.test.ts` (down дропает только новое)
- [ ] T011 [BE] Секрет-вольт `lib/integrations/secretVault.ts`: `encrypt/decrypt` AES-256-GCM (`node:crypto`, формат `v1:<iv>:<tag>:<ct>`, ключ `INTEGRATION_ENCRYPTION_KEY`); юнит-тесты: roundtrip, tamper → throw, missing key → throw, пустой payload
- [ ] T012 [BE] FSM→GC матрица `lib/integrations/gcalMapping.ts`: чистая функция `mapFsmToGcAction` по Decision Table `contracts/gcal-adapter.md` §2 (вся матрица: CREATE/PATCH/DELETE/NOOP, путь `RELEASED`-with-event, реплеи → upsert-семантика); юнит-тесты всех строк DT (без моков — чистая логика)

**Checkpoint**: схема расширена, вольт и матрица готовы.

---

## Phase 4: US1 — Google Calendar Sync (P0, Critical risk) 🎯 MVP

**Goal**: двусторонняя sync per-resource: OAuth-connect, push по полной FSM-матрице, busy-импорт с вычитанием слотов, health (FR-601..604).
**Independent Test** (spec US1, quickstart): connect → бронь в GC ≤60с (реплей без дублей) → стороннее событие GC блокирует слот ≤15 мин → cancel удаляет событие → reauth fail-open.

- [ ] T020 [BE] [US1] `lib/integrations/gcalClient.ts` (обёртка googleapis: auth-refresh с коллбэком `onTokenRefresh` для персистенции в `IntegrationCredential.encryptedPayload`, events, freeBusy) + OAuth-флоу: `app/api/admin/integrations/gcal/connect/route.ts` (redirect, одноразовый state TTL 10 мин), `callback/route.ts` (обмен кода → refresh-токен в вольт T011 → `IntegrationCredential` upsert per-resource), disconnect (полный wipe); OWNER-gate; юнит-тесты (state mismatch → 403, OPERATOR → 403, invalid code → `NEEDS_REAUTH`, повторный connect → upsert)
- [ ] T021 [BE] [US1] Push-воркер `lib/integrations/gcalPush.ts` (Inngest fn, outbox-канон 004): потребляет FSM-переходы → `gcalMapping` → GC API, идемпотентно по `extendedProperties.undresellerOrderId`; Meet ⇔ `Item.remoteMeetingEnabled`; идемпотентный `deleteEvent`: 404/410 от Google трактуется как успешный NOOP (audit status=already_deleted); контрактный сьют по ПОЛНОЙ матрице `contracts/gcal-adapter.md` §5 (14 строк, stubbed SDK): реплей ×20 → 1 событие, delete 404/410 → success, `invalid_grant` → `NEEDS_REAUTH` + бронь живёт (fail-open)
- [ ] T022 [BE] [US1] Sync-воркер `lib/integrations/gcalSync.ts`: инкрементальный `events.list(syncToken)` per-подключение (15 мин, гранулярный advisory lock `hashtext('gcal_sync_' || credential.id)`) → upsert/delete `ExternalBusyBlock` (UTC-нормализация, `transparent`/`cancelled` не импортируются; события с `extendedProperties.undresellerOrderId` строго фильтруются и не сохраняются); `410 Gone` → full-sync окна 30 дней с upsert-дедупом; пачки ≤50; юнит-тесты (5 сценариев из контракта §5: incremental, фильтрация своих событий, 410, N=0, 429-бэкофф)
- [ ] T023 [BE] [US1] Слот-вычитание: `lib/booking/availability.ts` вычитает `ExternalBusyBlock` **только своего ресурса** (SQL, UTC) наравне с `SlotReservation`; perf-гейт p95 ≤50 мс при 500 busy-блоках (evidence); юнит-тесты (изоляция мастеров A/B, окно 30 дней)
- [ ] T024 [BE] [US1] Health/обсервабилити FR-604: `GET /api/admin/integrations/gcal` (статусы per-resource), переход `invalid_grant`/403 → `NEEDS_REAUTH` + алерт в `STAFF_CHAT_ID`; audit-события `GCAL_CONNECTED/DISCONNECTED/SYNC_FAILED/PUSH_FAILED` (канон `emitAuditEvent`); дени-лист logger +4 ключа (`refreshToken`, `accessToken`, `webhookSecret`, `authorization`); тесты fail-open («GC выключен → бронь создаётся»)
- [ ] T025 [FE] [US1/US3] Админка `/admin/settings`: секция Integrations (статусы per-resource, connect/disconnect, NEEDS_REAUTH-баннер) + секция Webhooks (реестр ≤5, показ secretPrefix, secret one-time показ, статус circuit breaker, кнопка сброса failureCount/реактивации, test-ping) + чекбокс `remoteMeetingEnabled` в `/admin/catalog` + Meet-ссылка в подтверждении брони; webhook-подсекция рендерится за флагом `NEXT_PUBLIC_FEATURE_WEBHOOKS` (default off — включается с T040, пост-Demand Gate); i18n-ключи ru/en (+uk data-only); тесты паритета

**Checkpoint**: money-path календаря закрыт контрактом ×20 (Critical FR-602/603).

---

## Phase 5: US2 — ICS Attach (P2)

**Goal**: RFC 5545-аттач в email (FR-605).
**Independent Test** (spec US2): бронь с email → письмо с валидным `.ics` (стабильный UID, TZID); отмена → `METHOD:CANCEL` тем же UID.

- [ ] T030 [BE] [US2] `lib/integrations/ics.ts`: builder (escape-правила, `DTSTART;TZID=` из `ShopSettings.timeZone`, стабильный UID `booking-<orderId>@<instance>`, `METHOD:PUBLISH`/`CANCEL`, CRLF line-folding ≤75 октет); юнит-тесты: BVA escape (`,\;.:\n`), TZID (Asia/Yerevan, UTC), UID-стабильность, парсер-валидация структуры
- [ ] T031 [BE] [US2] Интеграция в email-контур 004: аттач `booking-<orderNumber>.ics` в подтверждение (`PUBLISH`) и отмену (`CANCEL`, тот же UID); тесты (method switching, повторная отправка — тот же UID)

---

## Phase 6: US3 — Outbound Webhooks & Public API (P3) ⏸ ПОСТ-DEMAND GATE

> **Governance (v2 re-sequencing 2026-10-29):** webhooks/read-API — инфраструктура форк-линии Product 3; до закрытия Demand Gate (10 аудитов) потребителей нет. Фаза НЕ блокирует релиз 006: US1+US2+Cutdown считаются поставляемыми без неё. T040–T042 стартуют после гейта; админка T025 рендерит секцию Webhooks за feature-флагом (`NEXT_PUBLIC_FEATURE_WEBHOOKS`, default off) до T040.

**Goal**: подписанные события + read-only API (FR-606..608).
**Independent Test** (spec US3): webhook на тест-бин получает подписанное событие ≤5 с; сбойный эндпоинт → 5 ретраев → audit; API 401/429/405.

- [ ] T040 [BE] [US3] Registry API `app/api/admin/webhooks/route.ts` (OWNER): CRUD ≤5 активных, генерация секрета (`whsec_<b64url>`, шифрование AES-256-GCM в `encryptedSecret` via T011, показ full secret once, сохранение `secretPrefix`), SSRF-гейт при регистрации (https-only, приватные IP → 422), `PATCH /:id` для реактивации/сброса `failureCount`, валидация events по закрытому списку; тесты (0/1/5/6 эндпоинтов, SSRF-классы, secret не отдаётся в GET)
- [ ] T041 [BE] [US3] Доставка `lib/integrations/webhookDelivery.ts` (Inngest fn, `retries: 5`): fan-out по активным эндпоинтам FSM-переходов → расшифровка секрета из `encryptedSecret` → POST (HMAC-SHA256 `t.body`, timestamp ±5 мин, timeout 5 с, SSRF socket-level IP pinning против DNS Rebinding, редиректы не следовать); исчерпание 5 ретраев → `failureCount += 1` + audit `WEBHOOK_DELIVERY_FAILED` + алерт; circuit breaker: при `failureCount >= 10` → `active = false` + audit `WEBHOOK_DISABLED` + алерт; контрактные тесты подписи из `contracts/outbound-webhooks.md` §6 (валидная, подмена тела, replay ±6 мин, circuit breaker на 10-й сбой, DNS Rebinding reject, payload pii=masked)
- [ ] T042 [BE] [US3] Public API `app/api/public/bookings/route.ts`: Bearer `PUBLIC_API_KEY` (constant-time), фильтры `from/to/status` (окно ≤31 день), детерминированная пагинация `{ data, nextCursor }` по compound-курсору `createdAt_id` (лимит ≤100), rate 30 req/min (канон `enforceRateLimit`), write → 405; тесты (401 без/с кривым ключом, 429, 405, 422 окно, пагинация nextCursor, pii=masked по умолчанию)

---

## Phase 7: Polish & Cross-Cutting (sync barrier — все US)

- [ ] T060 [SEC] STRIDE-верификация 006 по plan-матрице: SSRF-матрица (регистрация+вызов), HMAC-векторы (подмена/replay), OAuth-state, PII/token-скан логов (ноль секретов), лицензии новых deps + финальный `npm audit`; находки — фикс или документирование
- [ ] T061 [OPS] Runbook: `docs/whitelabel-quickstart.md` §13 (Google Cloud test/prod setup, consent screen, redirect URI, `INTEGRATION_ENCRYPTION_KEY` rotation, NEEDS_REAUTH recovery, webhook troubleshooting) + down-migration прогон `down.sql` на scratch (пруф в evidence)
- [ ] T062 [E2E] Quickstart tracer полный прогон (10 шагов `quickstart.md`) на test-проекте Google Cloud локально; результаты — `specs/006-integrations/evidence/quickstart-tracer.md`; perf-gate слот-расчёта из T023 приложен; **замер RSS до/в пик/после full-sync 120 событий (TC-GCAL-043) → `evidence/gcal-memory.md`**
- [ ] T063 [SETUP] Stage closeout: evidence-файлы собраны, `tasks.md` статусы, подготовка `/speckit.analyze`; краткая retro-заметка (branch-naming IX lineage)

---

## Dependency Graph

```
T001 → T050, T010, T011, T020, T040
T050 → T051
T051 → T052, T010, T011, T012  (zod@4 — рантайм-базовая линия всего фичевого кода)
T010 → T021, T022, T023, T024
T011 → T020, T021
T012 → T021
T020 → T021, T022, T061
T021 + T022 → T024
T022 → T023
T040 → T041, T042, T025(webhook-подсекция)  (пост-Demand Gate)
T024 → T025
T030 → T031
T021 + T041 → T060
T021 + T022 + T023 + T031 → T062
T060 + T061 → T063
T062 → T063
```

### Self-Validation Checklist

- [x] Every task ID referenced exists above
- [x] No circular dependencies
- [x] No orphan IDs
- [x] Fan-in `+` only, fan-out `,` only
- [x] No chained arrows on a single line

Примечания к порядку: **T051 → фичевые фазы** (v2: zod@4 мигрируется ДО написания кода 006 — снапшоты T050 покрывают только поверхность 004/005, новый код рождается на zod@4); **T040–T042 — пост-Demand Gate** (US3 не блокирует релиз; T025 рендерит webhook-подсекцию за флагом); `T020 → T061` (runbook документирует OAuth setup по факту рабочего флоу); `T010 → T021..T024` — единственный shared-file `prisma/schema.prisma` пишет только [DB].

---

## Parallel Lanes

| Lane | Agent Flow | Tasks | Blocked By |
| ---- | ---------- | ----- | ---------- |
| 1 | [SETUP] supply chain + zod | T001 → T050 → T051 → T052 | — |
| 2 | [DB] schema | T010 | T051 |
| 3 | [BE] integrations core | T011 → T020 → T021 → T024 | T012, T051 |
| 3b | [FE] admin UI | T025 | T024 (webhook-подсекция — за флагом до T040) |
| 4 | [BE] sync & slots | T022 → T023 | T020 |
| 5 | [BE] mapping | T012 | T051 |
| 6 | [BE] ICS | T030 → T031 | T051 |
| 7 | [BE] webhooks/API | T040 → T041; T040 → T042 | T051 + **пост-Demand Gate** |
| 8 | [SEC/OPS/E2E] close | T060, T061, T062 → T063 | lanes 3–6 |

---

## Agent Summary

| Agent | Tasks | Can Start After |
| ----- | ----- | --------------- |
| [SETUP] | 3 (T001, T050, T063) | immediately / T001 / all |
| [DB] | 1 (T010) | T051 |
| [BE] | 14 (T011, T012, T020, T021, T022, T023, T024, T030, T031, T040, T041, T042, T051, T052) | lane deps (T040–T042 — пост-Demand Gate) |
| [FE] | 1 (T025) | T024 |
| [SEC] | 1 (T060) | T021+T041 |
| [OPS] | 1 (T061) | T020 |
| [E2E] | 1 (T062) | lanes 3–6 |

**Critical Path**: T001 → T050 → T051 → T011 → T020 → T022 → T023 → T062 → T063 (сначала security-базовая линия, затем GC money-path).

**Total**: 22 задачи.

---

## Agent Dispatch Plan

| Agent | Subagent/Command | Skills | Input Context | Tasks | Files |
| ----- | ---------------- | ------ | ------------- | ----- | ----- |
| `[SETUP]` | orchestrator | architecture, clean-code | plan §Technical Context, research D1/D6 | T001, T050, T063 | `package.json`, `config/oss-reuse-registry.json`, CI, evidence/ |
| `[DB]` | database-architect | database-design, prisma-expert, clean-code | data-model (полный) | T010 | `prisma/` |
| `[BE]` | backend-specialist | api-patterns, nodejs-best-practices, typescript-expert, clean-code | contracts/gcal-adapter.md, contracts/outbound-webhooks.md, spec §2–4, research D1–D6 | T011, T012, T020, T021, T022, T023, T024, T030, T031, T040, T041, T042, T051, T052 | `lib/integrations/`, `lib/booking/`, `app/api/`, `lib/telemetry/` |
| `[FE]` | frontend-specialist | react-patterns, nextjs-best-practices, i18n-localization | spec §2 US1/US3, contracts §1/§4 | T025 | `app/admin/`, `components/`, `messages/` |
| `[SEC]` | security-auditor | vulnerability-scanner, code-review-checklist | plan §STRIDE, spec §Security | T060 | project-wide |
| `[OPS]` | devops-engineer | deployment-procedures, bash-linux | plan §Observability, quickstart §0 | T061 | `docs/`, evidence/ |
| `[E2E]` | test-engineer | testing-patterns, tdd-workflow | contracts (матрицы), quickstart.md | T062 | `tests/`, evidence/ |

---

## Implementation Strategy

**Security Baseline First (v2)**: Phase 2 = US4 (T050–T052) — zod@4 мигрируется ДО любого фичевого кода 006: (а) последний audit-high закрывается при минимальном дифф-окне; (б) весь код интеграций рождается нативно на zod@4 без повторной миграции; (в) снапшот-гейт T050 покрывает компактную поверхность 004/005.

**MVP Second**: US1 (T010–T025) — календарное ядро релиза 006; US2 (ICS) параллелится после T051. **US3 (webhooks/API) — пост-Demand Gate**: форк-линия без клиентов, релиз поставляется без неё (webhook-подсекция T025 за feature-флагом `NEXT_PUBLIC_FEATURE_WEBHOOKS`).

**Incremental Delivery**: каждый чекпоинт фазы = зелёные гейты (tsc/eslint/jest не падают ниже 367 тестов) + коммит «BE/FE/E2E: T0xx …» с отметкой `[X]` в этом файле.

**Parallel Agent Strategy**: lane 1 (setup+zod) стартует немедленно; фичевые lanes — после T051; schema.prisma — единственный писатель [DB]; Constitution VI: implement заблокирован до analyze PASS + ≥2 внешних ревью PASS.

## Notes

- Тесты в каждой задаче — TDD-Lite (тест до/сразу после), канон coding-standards: никаких `as any`/`console.log`/raw SQL.
- Critical FR-602/603 (Risk 20): контрактные сьюты T021/T022 обязаны покрыть полную Decision Table — это вход `/speckit.test-design` для DT+STM+Exploratory+UAT.
- Snapshot: `tasks/006-integrations/v1` этим коммитом (Principle VII; якорь для `/speckit.retrospective`).
