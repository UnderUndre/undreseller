# Tasks: 004 (004-telegram-bots)

**Input**: spec rev 1.2, plan.md, research.md (D1–D9), requirements-audit PASS, review fixes (F1–F12)
**Organization**: Phase 1 infra+webhooks → Phase 2 outbox → Phase 3 staff pager → Phase 4 client bot → Phase 5 GDPR → closeout.

## Phase 1: Infra + webhooks (US1)

- [x] T410 [BE] [US1] FR-405: `+grammy` dep; `botManager.ts` (ленивая инициализация по env токенам `STAFF_BOT_TOKEN`/`CLIENT_BOT_TOKEN`, healthcheck, waitForBots, no-op деградация); `security.ts` (timing-safe compare `X-Telegram-Bot-Api-Secret-Token`); webhook-роуты staff/client (`/api/telegram/staff/webhook` и `/api/telegram/client/webhook`, fail-closed 403 без секрета, 200-деградация при bot-init fail); security-DT тесты (secret × origin × degrade).

## Phase 2: Outbox (US2)

- [x] T420 [BE] [US2] FR-401/408:
  - `TelegramOutbox` коллекция: `bot ('staff'|'client')`, `actionType ('sendMessage'|'editMessageText'|'editMessageReplyMarkup')`, `toChatId`, `text`, `messageId?`, `replyMarkupJson?`, `sentMessageId?`, `priority (10..100)`, `status (queued|sending|sent|failed|dead)`, `leaseUntil`, `availableAt`, `attempts`, `lastError`, `aggregateType`, `aggregateId`, `metaJson`; частичный индекс `CREATE INDEX idx_telegram_outbox_queue ON telegram_outbox (status, priority DESC, created_at ASC) WHERE status = 'queued'`;
  - `outbox.ts`: `enqueue()`, `classifyError(): PERMANENT_NO_OP | RATE_LIMIT_429 | TRANSIENT`, канонический CTE claim SQL (`WITH batch AS (...) UPDATE telegram_outbox ... FROM batch RETURNING ...`) исключающий Postgres-ошибку 0A000;
  - `outboxDispatch.ts` Payload Job: 30-секундный крон, CTE claim батча ≤ 25, диспатч через `botManager`, сохранение `sentMessageId` при успехе `sendMessage`, attempts ≥ 5 → dead + audit `telegram.outbox-dead`;
  - Регистрация в `payload.config.ts`: `collections += TelegramOutbox`, `jobs.tasks += outboxDispatchTask`, `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]`;
  - STM-тесты: claim-race двух воркеров → 0 дублей; kill-worker (lease expiry) → 0 потерь; 429 → cooldown → доставка; stress: burst 100 → drain, steady p95 замер.

## Phase 3: Staff pager (US3)

- [x] T430 [BE] [US3] FR-402:
  - `staffAuth.ts`: 3-уровневая авторизация (L1 ShopSettings.staffChatIds → L2 env TELEGRAM_STAFF_CHAT_IDS → L3 чат карточки);
  - `staffConfirm.ts`: 2-шаговый confirm-barrier (`awaitConfirmBarrier`: 1-й клик → `REQUIRES_CONFIRMATION` + alert, 2-й клик в течение 30с → `CONFIRMED`, клик после 30с → re-arm);
  - `staffBot.ts`: карточка заказа (маскированный телефон `+7••• ••• •• 45`, notes-индикатор, слот в TZ инстанса из `ShopSettings.timeZone`); inline-кнопки approve/reject/reschedule/complete/blacklist;
  - `staffActions.ts`: approve/reject → `approveBooking` CAS; complete → order `completed` + audit (с предусловием: только для `orders.status === 'processing'` при активной брони); blacklist → confirm-barrier;
  - `ShopSettings.ts`: добавление полей `staffChatIds` (с `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`) и `defaultLocale` (ru/en);
  - `bookingService.ts`: интеграция в `createBooking` — авто-постановка карточки пейджера в `TelegramOutbox` (`bot: 'staff'`, `priority: 50`, `aggregateType: 'BOOKING'`, `aggregateId: String(reservationId)`) для всех staff-чатов;
  - DT-тесты: auth-матрица 3×5 (0 несанкционированных мутаций), двухшаговый barrier-тест (1 клик ≠ мутация, 2 клик = мутация), CAS: повторный клик → ALREADY_PROCESSED.
- [x] T431 [BE] [US3/US4] FR-403/D7:
  - `issueRescheduleToken` в `bookingService.ts` (новый nonce, CAS bump `schedule_version` + advisory lock, audit `booking.reschedule-token-issued`);
  - Хендлер reschedule в `staffActions.ts`: проверяет наличие `TgLink`; если есть — отправляет deep-link клиенту через outbox (`bot: 'client'`, `priority: 10`); если клиента нет в боте — возвращает ссылку в staff-alert и инициирует email;
  - Тесты: генерация токена, отправка ссылки в Telegram и фоллбэк при отсутствии связи.

## Phase 4: Client bot (US4)

- [x] T440 [BE] [US4] FR-407/403:
  - `TgLink` коллекция: `chatId: text`, `orderId: number`, `createdAt: timestamp`; составной уникальный индекс `UNIQUE (chat_id, order_id)`;
  - `clientBot.ts`: `/start <accessToken>` → валидация токена в `orders` → идемпотентная связка `(chatId, orderId)`;
  - Inline-кнопки несут `orderId` в `callback_data` (`c:ack:<orderId>`, `c:dec:<orderId>`);
  - Confirm: вызов `acknowledgeBooking` (CAS bump `schedule_version`), повторный клик → ALREADY_PROCESSED;
  - Decline: новый доменный шов `cancelBookingByClientChat(payload, { orderId, chatId, now })` в `bookingService.ts` — верификация `TgLink`, FSM cancel → RELEASED, исполнение политики возвратов 003 (Stripe refund до cutoff / `refund_requested` после cutoff), аудит `booking.cancel-by-telegram`, staff-alert (outbox HIGH=50);
  - 24h cooldown анти-спам (per chatId + action);
  - EP/DT тесты: linking-матрица (валидный токен / повтор / невалидный), отмена с авто-возвратом и без, cooldown-границы.
- [x] T441 [BE] [US4] FR-406:
  - `Blacklist` коллекция: `chatId?: text`, `phone?: text`, `reason: text`, `createdBy: text`; валидация: хотя бы один идентификатор задан; партиальные уникальные индексы `UNIQUE (chat_id) WHERE chat_id IS NOT NULL` и `UNIQUE (phone) WHERE phone IS NOT NULL`;
  - `blacklist.ts` enforcement: client callbacks → 403 + 0 мутаций, кнопки не рендерятся, старая клавиатура очищается (`actionType: 'editMessageReplyMarkup'` через outbox);
  - Staff blacklist action с 2-шаговым confirm-barrier;
  - DT-тесты: блокировка по chatId и по phone, очистка reply-markup.

## Phase 5: GDPR (US5)

- [x] T450 [BE] [US5] FR-404:
  - `redaction.ts`: при терминальном переходе брони (RELEASED/completed/cancelled) находит отправленные карточки по `aggregateType = 'BOOKING'` и `aggregateId = reservationId` со сохранённым `sentMessageId` → enqueue `actionType: 'editMessageText'` с `priority: 100` (CRITICAL), текст `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`, `replyMarkupJson: null`; fail → retry outbox;
  - `gdprPurge.ts` Payload Job (nightly): удаление записей `TgLink`, чей заказ находится в терминальном состоянии более 90 дней (BVA ±1 день); очистка `metaJson` и текста в `telegram_outbox` старше 30 дней;
  - Маскировка телефона (`+7••• ••• •• 45`) — общий хелпер;
  - Тесты: адресная редакция карточек по `sentMessageId`, retry при ошибке redaction, purge BVA 89/90/91 дней, PII-дени-лист в логах.

## Phase 6: Closeout

- [x] T460 [SETUP] Регрессия: `pnpm generate:types`, полный гейт 0 exit (validate/lint/int/build), 129+ старых зелёные, evidence (outbox CTE claim лог, CAS-матрица, auth-матрица, 2-step barrier лог, p95-замер), tasks-статусы.

## Dependency Graph

```
T410 → T420
T420 → T430
T430 → T431
T430 → T440
T440 → T441
T420 → T450
T431, T441, T450 → T460
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T410 → T420 → T430 → T440 → T441 → T460 (6 задач). **Total**: 9 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T410 → T420 | — |
| 2 | T430 → T431, T440 → T441 | T420 |
| 3 | T450 | T420 |
| 4 | T460 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T410, T420, T430, T431, T440, T441, T450 |
| [SETUP] | T460 |

## Notes
- TDD-Lite; Risk 16 (T420/T430) → STM+DT+Error Guessing до кода; Telegram-транспорт в тестах — инъекция fake fetch (0 сети); error-catalog: AUTH_DENIED/BARRIER_ACTIVE/BLACKLISTED/LINK_NOT_FOUND — снапшот-сьют расширяется.
