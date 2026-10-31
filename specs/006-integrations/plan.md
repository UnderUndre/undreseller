# Implementation Plan: 006 (006-google-calendar-and-integrations)

> "The best integration is the one you never have to debug at 3 AM." — Folk Wisdom
> "Синхронизация календарей — это как брак: главное, чтобы ни одна сторона не думала, что она главная." — Валера
> "Two hard problems in computer science: cache invalidation, naming things, and off-by-one errors." — Phil Karlton

**Branch**: `004-release-readiness` (grandfathered IX-девиация lineage 004/005/006 — закрытие в retro) | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md) (rev 1.3, zcode external-review remediation PASS-pending re-run)
**Input**: `specs/006-integrations/spec.md` + `requirements-audit.md` + `qa/preliminary-rtm.md` (17 traceable rows: 16 FR/NFR + подстрока NFR-602b; 2 Critical: FR-602/FR-603)

## Summary

Календарный контур + интеграционная обвязка поверх монолита 004/005, без новой топологии: (1) **Google Calendar — первая бизнес-интеграция Sprint B** (лимит «≤1» расходуется): OAuth2 per-resource подключение (OWNER-only, AES-256-GCM vault), push броней по полной FSM→GC-матрице через outbox (идемпотентно, 404/410 NOOP, Meet ⇔ `remoteMeetingEnabled`), инкрементальный busy-импорт (`events.list`/syncToken) per-resource каждые 15 мин (initial full-sync с `timeMin + singleEvents + showDeleted` → чистый syncToken-инкрементал без фильтров, рекуррентные серии как расширенные экземпляры, 410-fallback, session-level per-credential advisory lock, фильтрация своих событий) с вычитанием занятости в `listAvailableSlots`; (2) **ICS-аттач** (RFC 5545, стабильный UID) в email-подтверждение/отмену; (3) **outbound webhooks** (HMAC-SHA256 `t.body` симметричным ключом из vault, Inngest-ретраи ≤5, SSRF socket-level гейт, circuit breaker) + **read-only API** по `PUBLIC_API_KEY` с детерминированной пагинацией `nextCursor`; (4) **долг из 005**: zod 3.25 → 4.x exact-pin со снапшотами 400-форм (атомарный коммит). Три новые таблицы, одна аддитивная миграция (`onDelete: Cascade` на `resourceId`), лимит ≤500 MB RSS ненарушим (sync-пачки ≤50, GC-воркер без буферов).

## Technical Context

**Language/Version**: TypeScript 5.8, Node 22 (alpine), Next.js 15.5 App Router — без изменений.
**Primary Dependencies**: существующий стек 004/005 + **новые**: `googleapis` (официальный SDK, Apache-2.0, exact-pin). **Обновление**: `zod` 3.25 → 4.x exact-pin. Шифрование — `node:crypto` AES-256-GCM (stdlib, ноль новых deps на крипту). Удалений deps нет.
**Storage**: PostgreSQL 16 / Prisma — единственная ORM. Изменения: **3 новые таблицы** (`IntegrationCredential` с UNIQUE `(provider, resourceId)` NULLS NOT DISTINCT — F2-rev, `ExternalBusyBlock`, `WebhookEndpoint` с `onDelete: Cascade` на `resourceId`), enum'ы `IntegrationStatus`, новые поля `Item.remoteMeetingEnabled` + `Order.meetLink` (nullable, F6-rev). Всё аддитивно.
**Testing**: Jest 29 + ts-jest (сейчас 50 suites/367 tests — не ломать), characterization-снапшоты форм 400 (канон 005), stubbed-Google-SDK матрицы, ICS-парсер-валидация, perf-гейт слот-расчёта.
**Target Platform**: Docker `node:22-alpine`, Hetzner CPX42, `REPLICA_COUNT=1`, Traefik v3.
**Project Type**: web-монолит (тот же).
**Performance Goals**: слот-расчёт p95 ≤50 мс (локальная часть, busy-вычитание — SQL, без сетевых вызовов); push ≤60 с p95; webhook-доставка ≤5 с p95; ≤500 MB RSS включая sync-воркеры (пачки ≤50).
**Constraints**: ≤500 MB RSS (бизнес-план), GDPR-рынок (ПДн в GC = решение OWNER, DPA — зона инстанса), solo-dev, Expand/Contract (Constitution X), канон 004/005 (thin controllers, deny-list logger, outbox-ретраи, minor units).
**Scale/Scope**: white-label ≤ ~200 items / ≤ ~20 staff / ≤ ~2k bookings/мес; календарей ≤ по одному на ресурс (≤ ~20 подключений).
**Security Surface & STRIDE Triggers**: новые сетевые эндпоинты (OAuth callback, public API), токены/секреты (AES-256-GCM, HMAC), исходящие вызовы (SSRF) → STRIDE-матрица спеки обязательна, верификация T060.
**Database Migration Trigger**: схема модифицируется (3 таблицы + enum + поле) → аддитивный Expand-манифест в data-model.md §3.
**Supply Chain & Licensing**: `googleapis` Apache-2.0 → реестр `config/oss-reuse-registry.json`; `verify-licenses.mjs` PASS; `npm audit` **0 High/Critical** после zod@4 (NFR-605).
**Research Spikes & Disposal**: 0 спайков — обоснование в research.md (SDK официальный, шифрование stdlib, ретраи — Inngest-натива 004; Constitution XI: нет прототипов → нет утилизации).

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I. Source of Truth | PASS | `.claude/` не затрагивается |
| II. Transformer, Not Fork | N/A | нет новых AI-таргетов |
| III. Protected Slots | N/A | |
| IV. SemVer 0.x | PASS | приватное приложение |
| V. Token Economy | PASS | новых агентов/скиллов нет |
| VI. Cross-AI Review | ON TRACK | гейт перед implement: analyze + ≥2 внешних ревьюера |
| VII. Artifact Versioning | PASS | теги `spec/006-integrations/v1`, `bizplan/006-integrations/v1`, `requirements-audit/006-integrations/v1` ✅; `plan/006-integrations/v1` этим коммитом |
| VII-B. Business Plan | PASS | v20.1 (2026-10-31; канон лимита — v19.0, не изменён v20.0/20.1): GC = первая бизнес-интеграция, лимит «≤1» расходуется; riders — инфраструктура; цены/ICP не меняются; ICP-нарратив спеки синхронизирован с v20.0 (сервисный бизнес 3–25, F8-rev) |
| VIII. Self-Maintaining | PASS | architecture.md обновляется (§Feature Reference 006) |
| IX. Two-Phase | DEVIATION (та же, что 004/005) | branch `004-release-readiness` — grandfathered lineage, в retro |
| X. Expand/Contract | PASS | аддитивный Expand (`20270201000000_006_integrations` +down.sql); Contract-фаза не требуется (ни одно существующее поле не выводится из строя) |
| XI. Spike Governance | PASS | 0 спайков, обосновано в research.md |
| XII. QA Contour | ON TRACK | requirements-audit PASS ✅; preliminary-rtm ✅ (Critical FR-602/603 → DT+STM+Exploratory+UAT); test-design — после tasks; qa-signoff — после staging |

## Project Structure

### Documentation (this feature)

```text
specs/006-integrations/
├── spec.md                 # rev 1.2 (external-review remediation PASS)
├── requirements-audit.md   # PASS (история REJECTED→PASS)
├── checklists/requirements.md
├── qa/preliminary-rtm.md   # 17 требований, 2 Critical
├── research.md             # D1–D6, 0 спайков
├── data-model.md           # 3 таблицы + enum + поля (remoteMeetingEnabled, meetLink), Expand/Contract
├── contracts/gcal-adapter.md
├── contracts/outbound-webhooks.md
├── quickstart.md           # трейсер
└── plan.md                 # этот файл
```

### Source (изменения)

```text
lib/
├── integrations/
│   ├── secretVault.ts            # NEW: AES-256-GCM encrypt/decrypt (node:crypto)
│   ├── gcalMapping.ts            # NEW: чистая FSM→GC-матрица (Decision Table, FR-602)
│   ├── gcalClient.ts             # NEW: обёртка googleapis (auth refresh callback, events.list/inser/patch/delete, syncToken)
│   ├── gcalPush.ts               # NEW: push-воркер (outbox-потребитель FSM-переходов, 404/410 NOOP)
│   ├── gcalSync.ts               # NEW: инкрементальный busy-импорт (syncToken, per-credential lock, фильтрация своих событий)
│   ├── ics.ts                    # NEW: RFC 5545 builder (PUBLISH/CANCEL, TZID, stable UID)
│   └── webhookDelivery.ts        # NEW: HMAC-подпись (ключ из vault) + SSRF-гейт (DNS-pinning) + Inngest-ретраи + circuit breaker
├── booking/availability.ts       # MOD: вычитание ExternalBusyBlock per-resource
config/oss-reuse-registry.json    # MOD: googleapis entry
app/
├── api/admin/integrations/gcal/connect/route.ts    # NEW: OAuth redirect (state)
├── api/admin/integrations/gcal/callback/route.ts   # NEW: OAuth callback
├── api/admin/integrations/gcal/route.ts            # NEW: статус/disconnect
├── api/admin/webhooks/route.ts                     # NEW: registry CRUD + reactivate (OWNER)
├── api/public/bookings/route.ts                    # NEW: read-only API (детерминированный nextCursor)
├── admin/settings/page.tsx       # MOD: GC-секция (banner/status/disconnect) + webhooks (active switch, failureCount reset)
├── admin/catalog/page.tsx        # MOD: чекбокс remoteMeetingEnabled
components/catalog/…             # MOD: Meet-ссылка в подтверждении
lib/telemetry/logger.ts           # MOD: дени-лист + (refreshToken|accessToken|webhookSecret|authorization)
prisma/schema.prisma              # MOD: +3 таблицы (onDelete: Cascade на resourceId), +2 enum'а, +Item.remoteMeetingEnabled, +Order.meetLink
prisma/migrations/20270201000000_006_integrations/
package.json                      # MOD: +googleapis exact-pin, zod 3.25→4.x
```

## Threat Modeling (STRIDE)

| Категория | Цель | Вектор | Контрмера |
|---|---|---|---|
| **S**poofing | OAuth callback; webhook-приёмник; public API | CSRF на consent; подделка событий; перебор ключа | `state`-параметр (одноразовый, TTL); HMAC-SHA256 `t.body` + timestamp ±5 мин; constant-time сравнение `PUBLIC_API_KEY` |
| **T**ampering | Токены в БД; webhook payload; busy-интервалы | Чтение/правка `IntegrationCredential` напрямую | AES-256-GCM (auth-tag ловит подмену токенов и секретов вебхуков); payload подписан целиком; busy — только сторонние события (свои фильтруются) |
| **R**epudiation | Подключения/отключения GC; доставки webhook | «я не подключал календарь» | `emitAuditEvent` (канон 004): `GCAL_CONNECTED/DISCONNECTED`, `WEBHOOK_REGISTERED/DELETED/DISABLED`, `WEBHOOK_DELIVERY_FAILED` — без секретов |
| **I**nformation Disclosure | Логи; webhook payload; busy-данные | Утечка токенов; ПДн приёмникам; названия чужих событий | Дени-лист +4 ключа; webhook payload `pii=masked` по умолчанию; секреты в БД только AES-256-GCM; `ExternalBusyBlock` — только интервалы |
| **D**enial of Service | Sync-шторм; webhook-флуд; API | 429-петли; кривые эндпоинты; брутфорс ключа | Per-credential advisory lock + пачки ≤50; бэкофф Google (outbox-шейпинг); Inngest retries ≤5 + circuit breaker (`failureCount >= 10`); API 30 req/min |
| **E**levation | Registry/подключение; GC-данные как командный канал | OPERATOR лезет в OAuth; события GC управляют бронями | OWNER-gate на все integration-роуты; GC — read-only busy + push-write, GC-side правки не мутируют БД (табу spec §1.3) |

## Database Migration Strategy

Манифест — data-model.md §3: один аддитивный Expand `20270201000000_006_integrations` (+`down.sql`): 3 таблицы (IntegrationCredential — UNIQUE `(provider, resourceId)` NULLS NOT DISTINCT, F2-rev), 2 enum'а (`IntegrationProvider`, `IntegrationStatus`), `Item.remoteMeetingEnabled`, `Order.meetLink` (F6-rev), `onDelete: Cascade` на `resourceId`. Dual-write/backfill не требуется (новые сущности стартуют пустыми; `meetLink` — nullable, существующие брони не затрагиваются). Cutover — код по фичам. Contract-фаза не нужна (ничего не выводится из строя; `/api/booking/lock` → 410 уже запланирован отдельным решением ≤007, не в 006).

**Rollback**: `down.sql` дропает только новые объекты (безопасно — на них нет FK из старых таблиц; `resourceId` — nullable FK с `onDelete: Cascade`); git-revert схемы; GC-интеграция выключается disconnect'ом; webhooks — деактивацией эндпоинтов; zod-откат — git-revert коммита миграции T051 (изолированный атомарный коммит, снапшоты форм защищают контракт).

## Observability, Recovery & Rollback

- **Метрики/логи**: audit-события `GCAL_CONNECTED/DISCONNECTED/SYNC_FAILED/PUSH_FAILED`, `WEBHOOK_REGISTERED/DELIVERY_FAILED`, `API_KEY_USED` — через deny-list logger 004 + расширенный дени-лист (NFR-603); нулевой PII-скан (канон SC-403).
- **Health**: статус-эндпоинт интеграций в админке (FR-604); `/api/health` без изменений; недоступность GC видна как `SYNC_FAILED` + баннер.
- **DR**: RTO/RPO неизменны; GC-состояние восстанавливается полным sync (410-fallback — штатный путь); webhook-события ретраятся Inngest'ом; токен-компрометация → disconnect wipe + re-auth.
- **Rollback-триггеры**: >2% ложных блокировок слотов на пилоте (kill criteria спеки) → скоуп календаря режется до ICS-only; двойные эффекты webhook; утечка токена в логах (мгновенный rollback + ротация ключа). Процедура: disconnect → git-revert → down.sql.

## Risks & Complexity Tracking

| Риск | Вероятность | Митигация |
|---|---|---|
| zod@4 ломает форму ошибок API | средняя | FR-632 снапшоты до/после — блокер merge (канон 005) |
| OAuth-флоу капризничает на CPX42 (redirect URI, consent) | низкая | quickstart-трейсер на test-проекте до задач; runbook T061 |
| Silent desync (токен отозван, брони едут мимо GC) | средняя | FR-604: NEEDS_REAUTH-баннер + алерт; sync-пинг в health |
| FreeBusy-дубликаты при 410-fallback | низкая | upsert по unique `(calendarId, gcEventId)`; окно чистки 30 дней |
| SSRF через webhook URL | низкая | гейт при регистрации И вызове (T040/T041), https-only, приватные IP запрещены |
| Meet-конференции на не-remote услугах | низкая | флаг `remoteMeetingEnabled` default false; тест-гейт |

Нарушений конституции, требующих justification-таблицы, нет (IX — тот же grandfathered).

## Next

`/speckit.tasks` → распил по Stories 1–4 с трассировкой preliminary-RTM (Critical: FR-602/FR-603 → обязательные DT+STM+Exploratory+UAT в test-design).
