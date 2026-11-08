# Implementation Plan: 004 (004-telegram-bots)

> "Бот без outbox — это стенная газета: повесил и молись, что прочитают." — Валера

**Branch**: `main` (single-branch lineage — IX-девиация) | **Date**: 2026-11-08 | **Spec**: rev 1.2 (review fixes PASS)
**Input**: spec rev 1.2 + requirements-audit (PASS) + research.md (D1–D9) + 002/003 as-built (`c5f3bf1`, `3697b3d`)

## Summary

Telegram-контур на grammY (единственный новый dep):
1. **Dual-bot инфраструктура**: `staffBot` + `clientBot` с ленивой инициализацией, timing-safe webhook-роутами, fail-closed защитой и 200-деградацией;
2. **Durable TelegramOutbox**: поддержка примитивов `bot`, `actionType`, `messageId`, `replyMarkupJson`, `sentMessageId`, `aggregateType`, `aggregateId`; атомарный claim через PostgreSQL CTE с `FOR UPDATE SKIP LOCKED` (исключающий ошибку 0A000); частичный индекс `WHERE status = 'queued'`; синхронизация рантайма `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]`;
3. **Staff pager**: авто-постановка карточки при `createBooking` (приоритет HIGH=50) для всех staff-чатов; 5 CAS-действий (approve/reject/reschedule/complete/blacklist); 2-шаговый confirm-barrier на деструктив (`REQUIRES_CONFIRMATION` → `CONFIRMED` за 30с); 3-уровневая авторизация с защитой `ShopSettings.staffChatIds` через `adminOnlyFieldAccess`;
4. **Client bot**: deep-link связка `TgLink` с составным уникальным индексом `UNIQUE (chat_id, order_id)`; передача `orderId` в кнопках; подтверждение `acknowledgeBooking` (CAS bump); доменный шов `cancelBookingByClientChat` с исполнением политики возвратов 003 и алертом персоналу;
5. **GDPR и retention**: терминальная редакция карточек через `editMessageText` (CRITICAL=100) по сохранённым `sentMessageId`; ночной purge связок `TgLink` старше 90 дней и outbox-метаданных старше 30 дней;
6. **Staff reschedule**: `issueRescheduleToken` с доставкой ссылки в Telegram клиенту или фоллбэком в чат сотрудника.

## Technical Context

**Language/Version**: без изменений (Node 20+, TypeScript 5+, Next.js 15, Payload 3.93, PostgreSQL 16).
**Testing**: vitest int с **mock Bot API** (инъекция fake fetch-транспорта grammY — 0 сетевых запросов).
**New dep**: `grammy` (единственный новый dep, NFR-402).
**Jobs**: Payload Jobs — `outbox-dispatch` (крон `*/30 * * * * *`, батч ≤ 25) + `gdpr-purge` (nightly) — регистрируются в `jobs.tasks`; `jobs.autoRun` в `payload.config.ts` переводится на 30-секундный крон с батчем 25.

## Constitution Check

| Принцип | Статус | Примечание |
|---|---|---|
| I–V | PASS/N/A | без изменений от 003 |
| VI | ON TRACK | analyze + внешнее ревью antigravity PASS; гейт закрыт |
| VII | PASS | теги батчем на коммите контура (канон 001–003) |
| VII-B | PASS (waiver приложен) | Telegram-уведомление — финал сквозного процесса §2.2 плана |
| IX | DEVIATION (lineage) | как 001–003 |
| X | PASS | только additions (новые коллекции/поля, nullable) |
| XI | PASS | 0 спайков (контракт grammY верифицирован, CTE SKIP LOCKED стандартизирован) |
| XII | **PASS** | Risk 16 (FR-401/402/408) → STM+DT+Error Guessing покрыты в QA |
| XIII | PASS | WIP = 1 |

## Project Structure (Source changes)

```text
# Phase 1 — infra + webhooks (US1)
package.json                                  # MOD: + grammy (единственный dep, D1)
src/lib/telegram/botManager.ts                # NEW: ленивая инициализация, healthcheck, waitForBots, no-op деградация
src/lib/telegram/security.ts                  # NEW: timing-safe secret compare, fail-closed
src/app/api/telegram/staff/webhook/route.ts   # NEW: POST (secret → bot.handleUpdate)
src/app/api/telegram/client/webhook/route.ts  # NEW: POST

# Phase 2 — outbox (US2, FR-401/408)
src/collections/TelegramOutbox.ts             # NEW: bot, actionType, toChatId, text, messageId, replyMarkupJson, sentMessageId, priority, status, leaseUntil, availableAt, attempts, aggregateType, aggregateId, partial index
src/lib/telegram/outbox.ts                    # NEW: enqueue(), classifyError(), CTE claim SQL, starvation-boost ORDER BY
src/jobs/outboxDispatch.ts                    # NEW: Payload Job */30s, CTE SKIP LOCKED claim, batch ≤25, records sentMessageId
src/payload.config.ts                         # MOD: collections += TelegramOutbox/Blacklist/TgLink; jobs.tasks += dispatch/purge; jobs.autoRun cron */30s limit 25

# Phase 3 — staff pager (US3, FR-402)
src/lib/telegram/staffAuth.ts                 # NEW: 3-уровневая авторизация (ShopSettings → env → chat карточки)
src/lib/telegram/staffConfirm.ts              # NEW: 2-шаговый confirm-barrier (REQUIRES_CONFIRMATION → CONFIRMED, 30s)
src/lib/telegram/staffBot.ts                  # NEW: карточка (маскированный телефон), inline-кнопки
src/lib/telegram/staffActions.ts              # NEW: approve/reject → approveBooking CAS; complete → order-level (processing only); blacklist
src/globals/ShopSettings.ts                   # MOD: staffChatIds (access: adminOnlyFieldAccess), defaultLocale
src/lib/booking/bookingService.ts             # MOD: + createBooking pager enqueue (HIGH=50); + issueRescheduleToken (D7); + cancelBookingByClientChat (D5)

# Phase 4 — client bot (US4, FR-403/407)
src/collections/TgLink.ts                     # NEW: chatId, orderId, composite UNIQUE (chat_id, order_id)
src/collections/Blacklist.ts                  # NEW: chatId?, phone?, reason, createdBy, partial unique indexes
src/lib/telegram/clientBot.ts                 # NEW: /start linking, confirm (acknowledgeBooking), decline (cancelBookingByClientChat), cooldown 24h
src/lib/telegram/blacklist.ts                 # NEW: enforcement (403, скрытие кнопок, очистка reply-markup)

# Phase 5 — GDPR (US5, FR-404)
src/jobs/gdprPurge.ts                         # NEW: nightly, TgLink purge 90d BVA, outbox meta 30d
src/lib/telegram/redaction.ts                 # NEW: терминальная редакция карточек через editMessageText по sentMessageId (CRITICAL=100)

# Phase 6 — closeout
tests/int/*.int.spec.ts                       # NEW: outbox-race/cas-actions/auth-matrix/webhook-security/gdpr/cte-claim
```

## Threat Modeling (STRIDE)

- **S (Spoofing)**: webhook secret timing-safe ×2; staff-auth 3 уровня; `ShopSettings.staffChatIds` защищён `adminOnlyFieldAccess` (исключает чтение чужих chat ID); клиентские callbacks требуют наличия `TgLink (chatId, orderId)`.
- **T (Tampering)**: CAS scheduleVersion на всех мутациях; атомарный CTE SKIP LOCKED claim; двухшаговый confirm-barrier на деструктив.
- **R (Repudiation)**: AuditEvents на каждый bot-action (`approval.*`, `booking.cancel-by-telegram`, `telegram.outbox-dead`); PaymentEvents не затронуты (боты без денег).
- **I (Information Disclosure)**: маскированный телефон (`+7••• ••• •• 45`), notes-индикатор без текста, PII-дени-лист в логах, redaction карточек по `sentMessageId` на терминале, purge 90d.
- **D (Denial of Service)**: outbox буферизует Telegram-недоступность; 429-cooldown; starvation boost; партиальный индекс очереди; 24h cooldown анти-спам для клиентов.
- **E (Elevation of Privilege)**: боты без денег (taboo); complete — order-level строго для заказов в `processing` при активной брони; blacklist — блокирует несанкционированные действия.

## Rollback

Все изменения — additions; без Telegram-токенов боты no-op (outbox копит), webhook-роуты 403 fail-closed; откат = git; коллекции не мешают 002/003 путям.

## Risks & Mitigations

| Риск | Вер-ть | Митигация |
|---|---|---|
| grammY API ≠ ожиданиям | низкая | docs-контракт проверен (D1); transport инъекцией — тесты без сети |
| `FOR UPDATE` в subquery (Postgres 0A000) | устранено | Замена subquery на канонический CTE `WITH batch AS (...) UPDATE ... FROM batch` (D2) |
| Рассинхрон `autoRun` Payload Jobs | устранено | Синхронизация `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]` в `payload.config.ts` |
| Утечка chat ID сотрудников через API | устранено | Поле `staffChatIds` закрыто `adminOnlyFieldAccess` на чтение и запись |
| Отмена клиентом без токена | устранено | Добавлен метод `cancelBookingByClientChat` с верификацией `TgLink` и политикой возвратов 003 |
| Потеря `message_id` для GDPR-редакции | устранено | Поле `sentMessageId` фиксируется в `TelegramOutbox` при доставке; редакция адресно правит все карточки брони |
| PII в outbox-метаданных | средняя | metaJson redact-gate + 30d meta-purge (D6); NFR-403-тест |

## Next

`/speckit.tasks` — выполнено: 9 задач с точной детализацией контрактов; переход к `/speckit.implement` после фиксации тегов ревью.
