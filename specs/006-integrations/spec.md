# 📋 ЧАСТЬ 1: СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `006-google-calendar-and-integrations`
**Ветка:** `004-release-readiness` (grandfathered IX-девиация lineage 004/005 — закрытие в `/speckit.retrospective`)
**Путь к спеке:** `undreseller/specs/006-integrations/spec.md`
**Статус:** **DRAFT — REVISION 1.3 (zcode external-review remediation, F1–F10, 2026-10-31)**. Rev 1.2 интегрировал ремедиацию antigravity F1–F10 + analyze re-run #2 X1–X8. Rev 1.3 закрывает находки ревью zcode: syncToken-механика приведена к валидным сочетаниям Google API (full-sync с параметрами / чистый инкрементал, F1-rev) + рекуррентные события; `UNIQUE NULLS NOT DISTINCT` на `(provider, resourceId)` (F2-rev); PATCH-on-missing → re-CREATE (F3-rev); session-level advisory lock (F4-rev); таймзона ICS унифицирована (F5-rev); `Order.meetLink` персистится (F6-rev); HMAC-timestamp от момента попытки (F7-rev); бизнес-план v20.1 + ICP-нарратив v20.0 (F8-rev); runbook-пункты OAuth-restart и GC-сироты (F9/F10-rev). Источник решений: `/brainstorm` (Option 1 — Google Calendar API двухсторонняя синхронизация; riders: zod@4, ICS-аттач, outbound webhooks/public API — подтверждены пользователем).
**Архитектурный фундамент:** `SPEC-ARCH-INVARIANTS-2026`; контракт `PaymentProvider`/`InboxEvent` релизов 004/005; FSM `lib/kernel/bookingFsm.ts`
**Рантайм:** Node.js 22 LTS (`node:22-alpine`), PostgreSQL 16, Prisma ORM (единственная ORM)
**Source of truth по бизнесу:** `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v20.1 (Google Calendar = первая бизнес-интеграция Sprint B, расходует лимит «≤1» — канон v19.0, не изменён в v20.0/v20.1)

---

## 1. Контекст, Бизнес-Обоснование и Границы (Why & Bounds)

### 1.1. Проблема и бизнес-оправдание
ICP Sprint B — локальный сервисный бизнес (3–25 сотрудников со штатом мастеров и диспетчером; соло-мастера — Tertiary; канон ICP v18.9 → v20.0) — живёт в Google Calendar: сторонние записи, личные события, консультации. Сегодня шаблон считает занятость только по своим `SlotReservation` (GiST), поэтому: (а) мастер видит двойные брони, если слот уже занят событием в GC; (б) подтверждённую бронь приходится вручную переносить в свой календарь; (в) агентство не может отдать данные броней во внешние системы клиента (CRM, n8n-контур заказчика) — нет ни webhooks, ни read-API. Плюс: код всё ещё на zod 3.25 — единственный оставшийся audit-high (GHSA-mrhx-c7xc-m3w5).

### 1.2. Решение
1. **Google Calendar — первая и единственная бизнес-интеграция Sprint B** (расходует лимит «≤1», выбирается до старта SOW — закон бизнес-плана, канон v18.5 → v19.0, действителен в v20.1): двусторонняя синхронизация — push броней в GC (+ опциональный Google Meet для удалённых услуг) и импорт занятости GC (инкрементальный `events.list` с syncToken) в расчёт слотов.
2. **ICS-аттач** в email-подтверждении брони (подача данных, не интеграция — лимит не расходует).
3. **Outbound webhooks + read-only API** (инфраструктурный слой для форк-линии Product 3 — как платежи, лимит не расходует).
4. **Долг D1 из 005:** миграция zod 3.25 → 4.x.

### 1.3. Границы скоупа и законы Via Negativa (Strict Taboos)
* ❌ **ЗАКОН ОДНОЙ ORM:** 100% схемы, миграций и транзакций — **Prisma**. Drizzle запрещён.
* ❌ **ZERO CUSTOMER ACCOUNTS (не трогаем):** Google Sign-In клиентам запрещён; OAuth для подключения календаря — **строго OWNER** (OPERATOR/PERFORMER → 403, канон FR-601/Q7).
* ❌ **GC = READ-ONLY ИСТОЧНИК ЗАНЯТОСТИ:** правки/удаления событий, сделанные вручную в Google Calendar, **НЕ** мутируют брони в нашей БД (нет bidirectional mutation-обработки → нет бесконечных циклов синхронизации). Мастер отменяет бронь в системе (Staff-бот/админка), система сама удаляет событие из GC.
* ❌ **NO CALDAV-УНИВЕРСАЛ:** абстрактный CalDAV-слой (iCloud/Nextcloud/Яндекс) отвергнут брейнштормом (x2 сроки, зоопарк реализаций). Альтернативные провайдеры — за будущим адаптером, не в 006.
* ❌ **WEBHOOKS/API = ИНФРАСТРУКТУРА:** outbound webhooks и read-API не являются бизнес-интеграцией и лимит «≤1» не расходуют (классификация как у платежей, requirements.md §3).
* ❌ **NO PARALLEL QUEUE:** доставка webhooks — через существующую инфраструктуру outbox/Inngest 004, никаких новых очередей-прокладок.
* ❌ **NO SSRF:** webhook-endpoints — только `https://`, запрет приватных IP-диапазонов при регистрации и вызове.

### 1.4. Riders и хвосты, вошедшие в скоуп
| # | Rider | Источник |
|---|---|---|
| R1 | zod 3.25 → 4.x exact-pin (снапшоты форм 400-ответов обязательны) | 005 §1.4 D1 (отложен из-за объёма) |
| R2 | ICS-аттач в email-подтверждении брони | Решение пользователя 2026-10-26 (brainstorm) |
| R3 | Outbound webhooks + read-only bookings API | Продукт 3 (форк-линия v18.6) — предпосылка |

**Вне скоупа 006:** Outlook/Microsoft Graph и прочие календарные провайдеры (за будущим адаптером); Tier-2 паки 003.2 (за Demand Gate T069); GC-side mutation-синхронизация (см. табу); multi-replica webhooks (Redis — не планируется); OTel.

---

## 2. User Scenarios & Testing (Prioritized Journeys)

### User Story 1 — Двусторонняя синхронизация с Google Calendar (P1)
OWNER подключает свой Google-календарь в `/admin/settings` (OAuth consent, off-line access). Каждая подтверждённая бронь появляется в его GC с деталями; занятость из сторонних событий GC вычитается из свободных слотов на витрине.

**Why this priority**: устраняет главный источник no-show (двойные брони) и ручной перенос записей — ядро ценности для ICP; именно за это клиенты готовы платить.
**Independent Test**: подключить календарь тестовым Google-аккаунтом → создать бронь в системе → событие появилось в GC ≤60с; создать событие в GC на 10:00 → слот 10:00 на витрине исчез ≤15 мин (после sync-цикла).

**Acceptance Scenarios**:
1. **Given** календарь подключён, **When** клиент создаёт бронь (любой трек FSM), **Then** в GC появляется событие с названием услуги, временем, контактом и `extendedProperties.private.undresellerOrderId`; повторный push той же брони не создаёт дубликата.
2. **Given** в GC мастера стороннее событие 10:00–11:00, **When** клиент открывает витрину на этот день, **Then** слоты, пересекающие 10:00–11:00, недоступны для выбора.
3. **Given** мастер отменяет бронь в Staff-боте, **When** отмена проходит FSM, **Then** соответствующее событие в GC удаляется/отменяется, audit-событие записано.
4. **Given** refresh-токен отозван мастером в Google-аккаунте, **When** sync-цикл получает `invalid_grant`, **Then** интеграция помечается `NEEDS_REAUTH`, в админке появляется баннер, владельцу уходит алерт; брони в системе продолжают работать без GC.

### User Story 2 — ICS-аттач в email-подтверждении (P2)
Клиент, записавшийся через веб (не TG), получает email-подтверждение с приложением `.ics` — одним кликом добавляет бронь в любой календарь.

**Why this priority**: дешёвый (подача данных) и закрывает клиентов без Telegram; не блокирует US1.
**Independent Test**: оформить бронь через веб с email-контактом → письмо содержит валидный `.ics` (UID стабилен, таймзона IANA корректна, повторная отправка даёт тот же UID).

**Acceptance Scenarios**:
1. **Given** бронь создана с `customerEmail`, **When** отправляется email-подтверждение, **Then** аттач `booking-<orderNumber>.ics` валиден по RFC 5545 (METHOD:PUBLISH, DTSTART в таймзоне брони — наследуется от `ShopSettings.timeZone`, канон FR-605, escaped-символы).
2. **Given** бронь отменена, **When** отправляется email об отмене, **Then** аттач содержит `METHOD:CANCEL` с тем же UID.

### User Story 3 — Outbound webhooks + read-only API (P3)
OWNER регистрирует webhook-эндпоинты своей внешней системы (CRM, n8n); система подписывает события HMAC и ретраит сбои. Read-only API по статическому ключу отдаёт брони.

**Why this priority**: разблокирует форк-линию Product 3 и интеграции с CRM заказчика, но не влияет на ежедневный поток мастера — можно ехать после US1/US2.
**Independent Test**: зарегистрировать webhook на public request-bin → создать/отменить бронь → получены события с валидной подписью и timestamp; сбойный эндпоинт получает ≤5 ретраев с бэкоффом.

**Acceptance Scenarios**:
1. **Given** webhook зарегистрирован и активен, **When** бронь проходит переход FSM (created/confirmed/cancelled/paid/rescheduled), **Then** POST с payload брони и заголовками `X-Undreseller-Signature` (HMAC-SHA256 от `timestamp.body`), `X-Undreseller-Timestamp`; невалидная подпись на стороне приёмника = отбраковка (документировано).
2. **Given** эндпоинт отвечает 5xx/timeout, **When** доставка не удалась, **Then** ретраи с экспоненциальным бэкоффом (≤5 попыток), после исчерпания — событие помечено `FAILED` + алерт в `STAFF_CHAT_ID`.
3. **Given** валидный `PUBLIC_API_KEY`, **When** `GET /api/public/bookings?from=...&to=...`, **Then** 200 JSON броней (read-only, rate-limited 30 req/min); без ключа — 401.

### User Story 4 — Долг R1: миграция zod@4 (P2-debt)
Механическая миграция zod 3.25 → 4.x по changelog: `z.record(K,V)`, `error.flatten()` → `z.flattenError`, `.strict()/.passthrough()` → `z.strictObject/z.looseObject`, `coerce`. Снапшоты форм 400-ответов до/после обязаны совпасть.

**Why this priority**: закрывает единственный audit-high (supply-chain), не блокирует US1 — но должен ехать в том же релизе, пока дифф-окно маленькое.
**Independent Test**: `npm audit` → 0 High/Critical; полный jest зелёный; снапшоты 400-форм идентичны.

**Acceptance Scenarios**:
1. **Given** код мигрирован на zod 4 exact-pin, **When** `npm audit --audit-level=high`, **Then** 0 уязвимостей High/Critical.
2. **Given** characterization-снапшоты 400-ответов (booking create, adminSchemas, presign), **When** миграция завершена, **Then** формы ошибок побайтно идентичны снапшотам до.

---

## 3. Edge Cases

- **Таймзоны**: бронь в `Asia/Yerevan`, мастер в GC в другом поясе — события пишутся в UTC c IANA-аннотацией; busy-интервалы нормализуются в UTC до сравнения (запрет сравнения «наивных» дат).
- **Часовой дрейф занятости**: кэш занятости живёт ≤15 мин; при спорных слотах перед холдом — повторная проверка пересечения в транзакции холда (GiST остаётся финальным барьером).
- **Квоты Google API**: 600 запр/мин/пользователь — на скейле ≤2k броней/мес не достигается; при 429/403 — экспоненциальный бэкофф (переиспользуемый outbox-шейпинг 004).
- **Рекуррентные события GC (F1-rev)**: full-sync импортирует расширенные экземпляры серий (`singleEvents: true`) как отдельные busy-блоки; в дельте правка/отмена экземпляра приходит с собственным `gcEventId` — upsert/delete как для одиночных. Инкрементальный запрос формируется строго `events.list({ syncToken })` **без** `timeMin`/`q` (Google API запрещает фильтр-параметры с syncToken — 400).
- **Конференция Meet**: сервис с `remoteMeetingEnabled=true` получает Meet-ссылку в событии GC и в подтверждениях; флаг выключен — событие без conferencing. Meet-ссылка персистится push-воркером в `Order.meetLink` из ответа GC (F6-rev); если email-подтверждение уходит раньше завершения async-push, письмо уходит без Meet-ссылки — она остаётся доступной в GC-событии, Staff-боте и админке.
- **Disconnect и GC-сироты (F10-rev)**: disconnect календаря wipe'ает токен и sync-состояние; уже запушенные события в GC мастера остаются (known limitation — чистка и повторное подключение описаны в runbook T061); отмена брони в период отключения помечает событие-сироту delete-задачей, которая исполнится при следующем reconnect (идемпотентный 404/410 NOOP для несуществующих).
- **GDPR purge**: `POST /api/admin/orders/[id]/purge` удаляет соответствующее событие из GC и ПДн из webhook-payload-логов; disconnect календаря стирает refresh-токен (шифрованный) безвозвратно.
- **Webhook-URL злодей & SSRF (F4)**: регистрация `http://`, приватных IP (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1) и не-HTTPS отклоняется 422; при вызове — socket-level валидация разрешенного IP (защита от TOCTOU DNS Rebinding), редиректы запрещены.
- **Параллельные sync-циклы (F5/F4-rev)**: гранулярный **session-level** advisory lock `pg_try_advisory_lock(hashtext('gcal_sync_' || credential.id))` + `pg_advisory_unlock` в `finally` — per-credential изоляция (мастера не блокируют друг друга при sync); session-level выбран потому, что sync делает сетевые вызовы минутами — транзакционно-скоупед лок либо снимается сразу, либо держит connection пула весь цикл.
- **Идемпотентный delete в GC (F3)**: 404/410 от Google API при удалении события трактуется как успешный NOOP (audit status=already_deleted), без срыва воркера.
- **Фильтрация своих броней в sync (F2)**: события GC с `extendedProperties.private.undresellerOrderId` отбрасываются sync-воркером и не попадают в `ExternalBusyBlock`.
- **Часовой пояс подтверждения ICS**: `DTSTART;TZID=` использует `ShopSettings.timeZone`, а не серверный пояс.

## 4. Requirements (FR Inventory)

### Functional Requirements
- **FR-601 (OAuth2 Connect)**: строго **OWNER** подключает календарь через `/admin/settings` (OPERATOR/PERFORMER → 403 серверно): OAuth2 consent (`calendar.events`, `calendar.readonly`, off-line access, state-параметр против CSRF); refresh-токен хранится зашифрованным (AES-256-GCM, ключ `INTEGRATION_ENCRYPTION_KEY` из env); целевой `calendarId` фиксируется при подключении. **Гранулярность привязки: один календарь на ресурс** (`IntegrationCredential.resourceId` → `StaffMember.resourceId`; `null` = instance-wide ресурс `default_master` для соло-режима; связь с `Resource` имеет `onDelete: Cascade`). Ресурсы без подключённого календаря работают только по своим `SlotReservation` (как 004). Отключение — полный wipe токена и sync-состояния (судьба запушенных GC-событий — edge case F10-rev).
- **FR-602 (Push: бронь → GC)**: полная FSM→GC-матрица (идемпотентно, `extendedProperties.private.undresellerOrderId` + `resourceId`): `BOOKED` → создать/обновить событие (заголовок `"<услуга> — <orderNumber>"`, описание с контактом — PII-редакция канона 004, Meet-conferencing ⇔ `Item.remoteMeetingEnabled`, Meet-ссылка персистится в `Order.meetLink` F6-rev); `CANCELLED` (любая `CancellationReason`) → удалить событие (404/410 от Google = идемпотентный NOOP, F3); **`reservation RELEASED` при живом событии** (коллизия `PAID_REQUIRES_RESOLUTION`, admin-отмена) → удалить событие + audit; `UNDERPAID`/`PAYMENT_PENDING`/`PAYMENT_EXPIRED` → события нет (push только на `BOOKED`); перенос (`scheduleVersion` CAS) → обновить время события, **Google 404 (событие удалено мастером в GC) → re-`CREATE`** (F3-rev, PATCH-on-missing не уходит в ретраи 5xx). Push — асинхронный через outbox (не в транзакции брони; сбой GC не срывает бронь).
- **FR-603 (Import: GC → занятость)**: фоновый sync каждые 15 мин **per-подключённый-календарь**: initial full-sync `events.list({ timeMin: now, singleEvents: true, showDeleted: true })` → фиксация `nextSyncToken` с исходными параметрами; инкрементальный — строго `events.list({ syncToken })` **без фильтр-параметров** (F1-rev, Google API возвращает 400 на `timeMin`+`syncToken`); гранулярный **session-level** advisory lock per-credential F4-rev; busy-интервалы **исключительно сторонних событий** (рекуррентные серии — как расширенные экземпляры по собственным instance-`gcEventId`, F1-rev) сохраняются в новую таблицу `ExternalBusyBlock` (привязана к `resourceId` календаря с `onDelete: Cascade`; события с `undresellerOrderId` строго отфильтровываются F2; без ПДн сторонних гостей — только интервалы); `listAvailableSlots` вычитает занятость **только своего ресурса** наравне с `SlotReservation` (занятость мастера A в его GC не блокирует слоты мастера B); кэш ≤15 мин; `410 Gone` → full-sync окна 30 дней.
- **FR-604 (Sync Health)**: статус интеграции (`CONNECTED` / `NEEDS_REAUTH` / `DISABLED`) виден в `/admin/settings`; `invalid_grant`/403 → `NEEDS_REAUTH` + алерт; счётчик сбоев доставки push → деградация-лог; ни один сбой GC не блокирует приём броней (fail-open для брони, fail-closed для витрины слотов только в границах известной занятости).
- **FR-605 (ICS-аттач)**: email-подтверждение/отмена содержит RFC 5545 `.ics` (стабильный UID `booking-<orderId>@<instance>`, `METHOD:PUBLISH`/`CANCEL`, TZID из `ShopSettings.timeZone`, escape-правила); повторная отправка не меняет UID.
- **FR-606 (Webhook Registry)**: `/admin/settings` (OWNER): до 5 эндпоинтов (URL https-only, список подписанных событий, `secret` генерируется системой, показывается один раз и сохраняется зашифрованным AES-256-GCM в `encryptedSecret` F1, открыто хранится `secretPrefix`), кнопка «Send test ping». Доставка: POST JSON, заголовки `X-Undreseller-Signature` (HMAC-SHA256 от `timestamp.body` секретом), `X-Undreseller-Timestamp`; ретраи ≤5 с бэкоффом через outbox; SSRF-гейт с защитой от DNS Rebinding (F4); Circuit Breaker: при `failureCount >= 10` **подряд** (успешная доставка сбрасывает счётчик в 0) авто-перевод в `active = false` + алерт (F7).
- **FR-607 (Webhook Events)**: события `booking.created`, `booking.confirmed`, `booking.cancelled`, `booking.paid`, `booking.rescheduled` с payload: `orderId`, `orderNumber`, `status` (DB-термины), `serviceTitle`, `startsAt`/`endsAt` (UTC ISO), `totalMinor`/`currency`, `fulfillmentMode`. ПДн клиента — **всегда маскированы** (`pii=masked` без механизма размаскировки в 006; align contracts/outbound-webhooks.md).
- **FR-608 (Read-only API)**: `GET /api/public/bookings` с `Authorization: Bearer <PUBLIC_API_KEY>` (env per-instance): фильтры `from`/`to`/`status`, детерминированная пагинация по составному opaque-курсору `nextCursor` (F10), лимит ≤100/стр, rate-limit 30 req/min; без ключа/невалидный — 401; write-методы — 405.
- **FR-630 (zod exact-pin 4.x)**: `package.json` — zod `4.x` exact-pin; `npm audit` → 0 High/Critical; payload caps 004 остаются defense-in-depth.
- **FR-631 (Механическая миграция)**: по changelog zod 4 — все точки `lib/validation/*`, `app/api/**`, `config/shop.config.ts`, shared-схемы админки.
- **FR-632 (Контрактная стабильность)**: снапшот-тесты форм 400-ответов (booking create, adminSchemas, presign) до/после — идентичны; расхождение = блокер merge.

### Non-Functional Requirements (ISO/IEC/IEEE 29148:2018)
- **NFR-601 (Memory)**: ≤500 MB RSS инстанса — ненарушим; GC-sync-воркер не держит буферы событий (стриминг/пачки ≤50).
- **NFR-602 (Latency)**: `listAvailableSlots` p95 ≤50 мс на локальной части (вычитание `ExternalBusyBlock` — SQL, не сетевой вызов); push-событие в GC ≤60 с от перехода FSM (p95).
- **NFR-603 (Secrets)**: refresh-токен и webhook-секреты — только зашифрованными (AES-256-GCM); дени-лист logger 004 расширяется (`refreshToken`, `accessToken`, `webhookSecret`, `authorization`); ноль токенов в логах (PCI DSS Req 10 / ISO 27001).
- **NFR-604 (Delivery SLA)**: webhook-доставка p95 ≤5 с от события; ретраи ≤5; audit `WEBHOOK_DELIVERY_FAILED` после исчерпания; circuit breaker при 10 сбоях **подряд** (успех сбрасывает `failureCount`).
- **NFR-605 (Supply Chain)**: `googleapis` (Apache-2.0) exact-pin в реестре `oss-reuse-registry.json`; `verify-licenses.mjs` PASS; `npm audit` 0 H/C после zod@4.

### Regulatory & Compliance Screening
- **Jurisdictions**: GDPR (EU) — ПДн клиентов передаются в webhook-приёмники и Google Calendar по решению OWNER (DPA Google Workspace — зона ответственности инстанса, фиксируется в runbook); 152-ФЗ — не применим к шаблону, решается конфигурацией инстанса.
- **Data Classification**: PII (контакты клиента в payload/events), Confidential (OAuth-токены, webhook-секреты).
- **Scope Reduction**: токены — AES-256-GCM at rest; webhook payload по умолчанию без ПДн (`pii=masked`); Google — процессор, не контроллер наших данных.
- **Kill Criteria**: если busy-импорт даёт >2% ложных блокировок слотов на пилоте, или OAuth-флоу не проходит на CPX42 за 2 спринт-дня — скоуп календаря режется до ICS-аттача (Option 0 fallback), webhooks остаются.

### Security & Threat Mitigation (STRIDE)
- **Spoofing**: OAuth `state` (CSRF); webhook-приёмник верифицирует HMAC + timestamp (±5 мин); `PUBLIC_API_KEY` — constant-time сравнение.
- **Tampering**: подпись `timestamp.body` покрывает всё тело; SSRF-гейт (https-only, приватные IP запрещены, socket-level IP pinning против DNS Rebinding) при регистрации И вызове; `syncToken` инкрементальности не доверяет клиенту.
- **Repudiation**: `IntegrationAuditEvent`-записи через существующий `emitAuditEvent` (`GCAL_CONNECTED`, `GCAL_SYNC_FAILED`, `WEBHOOK_REGISTERED`, `WEBHOOK_DELIVERY_FAILED`, `WEBHOOK_DISABLED`, `API_KEY_USED`) — без секретов.
- **Information Disclosure**: токены/секреты шифрованы (AES-256-GCM); логи — дени-лист; webhook payload — ПДн маскированы по умолчанию; busy-импорт хранит только интервалы, без названий/гостей сторонних событий.
- **Denial of Service**: sync — per-credential advisory lock + пачки ≤50; webhook-ретраи ограничены + circuit breaker; API — 30 req/min; Google 429 — бэкофф (outbox-шейпинг).
- **Elevation of Privilege**: OAuth-флоу и webhook-registry — строго OWNER (`authenticateStaff(req, 'OWNER')`); API-key — read-only; push-воркер не принимает авторизационных решений из данных GC.

### Key Entities (Prisma: 3 новые таблицы, остальное — поля)
- **`IntegrationCredential`**: provider (`GOOGLE_CALENDAR`), resourceId (nullable — `null` = instance-wide ресурс `default_master`, FK `Resource` с `onDelete: Cascade`; UNIQUE `(provider, resourceId)` **NULLS NOT DISTINCT** — F2-rev: обычный UNIQUE пропускал дубликаты при `NULL`), encrypted payload (refresh/access token, calendarId, syncToken, status), connectedByStaffId, lastSyncAt, lastError. До одной активной строки на ресурс-провайдера — теперь реально enforced на уровне БД.
- **`ExternalBusyBlock`**: resourceId (FK `Resource` с `onDelete: Cascade`), calendarId, startUtc, endUtc, gcEventId (stable), source (`GCAL`), expiresAt. Без ПДн; чистится sync-циклом (окно 30 дней вперёд).
- **`WebhookEndpoint`**: url, encryptedSecret (AES-256-GCM), secretPrefix, events[], active, failureCount, lastDeliveryAt/Status. + флаг `Item.remoteMeetingEnabled Boolean @default(false)` (Meet-conferencing, data-model §1.4).
- Миграция: одна Expand-фаза `20270201000000_006_integrations/` (+down.sql): 3 таблицы + 2 enum'а + `Item.remoteMeetingEnabled` + `Order.meetLink` (nullable, F6-rev), по канону Constitution X.

## 5. Success Criteria (Measurable Outcomes)

- **SC-001**: OWNER подключает Google Calendar за ≤2 минуты без помощи инженера (OAuth-consent → статус `CONNECTED`).
- **SC-002**: бронь появляется в GC ≤60 с (p95) после перехода в `BOOKED`; отмена удаляет событие ≤60 с.
- **SC-003**: стороннее событие GC блокирует соответствующие слоты витрины ≤15 мин после создания (sync-цикл), 0 двойных броней на пилоте.
- **SC-004**: webhook-приёмник получает событие ≤5 с (p95) с валидной подписью; 100% событий имеют audit-след.
- **SC-005**: `npm audit` — 0 High/Critical (zod@4); 50 suites / 367+ тестов зелёные; снапшоты 400-форм идентичны.
- **SC-006**: ни один сбой GC/API не блокирует приём броней (fail-open для бронирования — verified тестом «GC выключен → бронь создаётся»).

## 6. Зафиксированные Решения (Clarifications Matrix)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Механизм календаря | Google Calendar API (Option 1) — двухсторонняя: push броней + busy-импорт (`events.list`/syncToken); CalDAV-универсал и ICS-only отвергнуты брейнштормом | Реальная двусторонняя синхронизация за вменяемые сроки;Option 0 остаётся kill-criteria fallback |
| Q2: Состав riders | zod@4 + ICS-аттач + outbound webhooks/read-API | Решение пользователя 2026-10-26; webhooks/API = инфраструктура, лимит «≤1» не расходуют |
| Q3: Кто тратит лимит бизнес-интеграции | GC — расходует; ICS/webhooks/API — нет | Классификация requirements.md §3 (как платежи в 004/005) |
| Q4: GC-side правки событий | Не мутируют наши брони (read-only busy + push-write) | Нет bidirectional mutation → нет циклов синхронизации; мастер отменяет в системе |
| Q5: Meet-ссылки | `Item.remoteMeetingEnabled` (default false) → conferencing на событии GC | Для консультаций/тьюторов без ломки FSM IN_CALL/OUT_CALL |
| Q6: Sync-механика | Фоновый инкрементальный sync 15 мин (advisory lock) + GiST как финальный барьер холда | Сетевые вызовы вне слот-расчёта; NFR-001 (50 мс p95) сохраняется |
| Q7: Кто подключает календарь (аудит B1) | Строго OWNER (OPERATOR/PERFORMER → 403) | Устранено противоречие FR-601 ↔ STRIDE-Elevation; токены — уровень владельца |
| Q8: Гранулярность календаря (аудит B3) | Один календарь **на ресурс** (`IntegrationCredential.resourceId`; null = `default_master`); busy-импорт изолирован по ресурсу | Multi-staff ICP v18.9 (3–25 сотрудников): занятость мастера A не блокирует мастера B |
| Q9: FSM→GC-матрица (аудит B2) | Полная матрица в FR-602: RELEASED при живом событии → delete + audit | Закрыта дыра коллизии `PAID_REQUIRES_RESOLUTION` |

**Открытые veto-пункты** (дефолты зафиксированы, ветируемы до plan-фазы): Q4 (GC-side no-op), Q5 (Meet как флаг услуги), Q6 (15-мин цикл), лимит 5 webhook-эндпоинтов, rate 30 req/min для API.
