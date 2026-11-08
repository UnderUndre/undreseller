# Research: 004-telegram-bots

> Plan Phase 0 — Engineering Decisions (D1–D9). Grounding: 002+003 as-built (`c5f3bf1`, `3697b3d`) + Payload Jobs контракт (дистрибутив прочитан, L1) + Review fixes (rev 1.2).

## D1. Telegram-фреймворк: **grammY** (единственный новый dep)

- **Decision**: `grammy` (self-contained, без плагинов runner/врат). Webhook-режим: `webhookCallback(bot, 'stdlib')`-эквивалент вручную — свой Next-роут вызывает `bot.handleUpdate(update)` после проверки secret-token.
- **Rationale**: raw Bot API = ручной парсинг 30+ типов update, callback-query типизация, retry-политика — дороже одного dep; альтернативы: Telegraf (аккумулированный легаси-выбор проигрывает grammY по типизации/поддержке), свой клиент (непрозрачность). NFR-402 фиксирует ровно один dep.
- **Alternatives**: Telegraf; raw fetch-клиент.
- **Spike Governance**: не требуется (webhook + handleUpdate проверяются интеграционными тестами с фейковым Bot API-сервером — mock fetch, без сети).

## D2. Outbox-модель и dispatch: **Payload Job + CTE SKIP LOCKED claim**

- **Decision**: коллекция `TelegramOutbox`:
  - `bot`: `'staff' | 'client'` (селектор токена и инстанса grammY);
  - `actionType`: `'sendMessage' | 'editMessageText' | 'editMessageReplyMarkup'` (примитивы API);
  - `toChatId`: `text` (PII, маскируется в логах);
  - `text`: `text` (содержимое сообщения);
  - `messageId`: `number` (для editMessageText / editMessageReplyMarkup);
  - `replyMarkupJson`: `jsonb` (inline-кнопки действий);
  - `sentMessageId`: `number` (Telegram message_id, сохраняется после успешной доставки `sendMessage` для будущей GDPR-редакции);
  - `priority`: `int` (CRITICAL=100, HIGH=50, NORMAL=10);
  - `status`: `'queued' | 'sending' | 'sent' | 'failed' | 'dead'`;
  - `leaseUntil`: `timestamp` (30s lease);
  - `availableAt`: `timestamp` (для 429-cooldown);
  - `attempts`: `int` (max 5);
  - `lastError`: `text`;
  - `aggregateType`: `'BOOKING'`;
  - `aggregateId`: `text` (ссылка на reservationId/orderId);
  - `metaJson`: `jsonb` (PII-redacted метаданные).

- **PostgreSQL CTE Claim**: В PostgreSQL конструкция `WHERE id IN (SELECT id ... FOR UPDATE SKIP LOCKED)` вызывает ошибку `0A000` (FOR UPDATE не разрешён во вложенном выражении). Атомарный батч-клейм реализуется каноническим CTE с `FROM batch`:
  ```sql
  WITH batch AS (
    SELECT id
    FROM telegram_outbox
    WHERE status = 'queued'
      AND (available_at IS NULL OR available_at <= now())
      AND (lease_until IS NULL OR lease_until < now())
    ORDER BY
      (priority + CASE WHEN created_at < now() - interval '5 minutes' THEN 10 ELSE 0 END) DESC,
      created_at ASC
    LIMIT 25
    FOR UPDATE SKIP LOCKED
  )
  UPDATE telegram_outbox o
  SET status = 'sending',
      lease_until = now() + interval '30 seconds',
      updated_at = now()
  FROM batch
  WHERE o.id = batch.id
  RETURNING o.id, o.bot, o.to_chat_id, o.text, o.action_type, o.message_id, o.reply_markup_json, o.attempts, o.aggregate_type, o.aggregate_id;
  ```
- **Индексирование**: Поскольку выражение `created_at < now() - interval '5 minutes'` содержит волатильную функцию `now()` и не может быть частью индекса, создаётся частичный B-tree индекс по активной очереди:
  `CREATE INDEX idx_telegram_outbox_queue ON telegram_outbox (status, priority DESC, created_at ASC) WHERE status = 'queued';`
  Размер выборки со статусом `'queued'` в штатном режиме составляет десятки строк, что гарантирует время сканирования и сортировки < 1 мс.
- **Payload Jobs autoRun синхронизация**: Payload's `_initializeCrons` по умолчанию запускает воркер раз в минуту с лимитом 10. Для исполнения требований 30s клейма батчами по 25 сообщений, в `payload.config.ts` настраивается `jobs.autoRun: [{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]` (с фоллбэком на 1-минутный крон и батч 50 при 5-field ограничениях окружения).
- **Dead-letter audit**: Переход сообщения в статус `dead` (после 5 попыток или PERMANENT ошибки) фиксируется записью в `AuditEvents` (`action: 'telegram.outbox-dead'`).

## D3. Webhook security: **timing-safe secret + fail-closed**

- **Decision**: оба роута сверяют `X-Telegram-Bot-Api-Secret-Token` с env (`TELEGRAM_STAFF_WEBHOOK_SECRET` / `TELEGRAM_CLIENT_WEBHOOK_SECRET`) через `timingSafeEqual`; секрет отсутствует → 403 на всё (fail-closed, канон 001 F-03); ошибка инициализации бота → 200 + лог деградации (Telegram не ретраит, урок 007 F-06).
- **Rationale**: timing-safe исключает побайтовый oracle; 200-деградация ломает retry storm.

## D4. Staff-авторизация и двухшаговый Confirm-Barrier

- **Decision**:
  - Авторизация: chatId авторизован, если: (L1) ∈ `ShopSettings.staffChatIds` ИЛИ (L2) ∈ env `TELEGRAM_STAFF_CHAT_IDS` (csv) ИЛИ (L3) chatId == чату, куда карточка была отправлена.
  - **Безопасность данных**: Поле `staffChatIds` в `ShopSettings` обязательно конфигурируется с `access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess }`, чтобы не допустить утечки личных Telegram ID через публичный REST API `/api/globals/shop-settings`.
  - **Confirm-Barrier (2-шаговый канон легаси `staffConfirm.ts`)**: Деструктивные действия (`reject`, `blacklist`) защищены двухшаговым барьером на 30 секунд:
    - 1-й клик: действие НЕ выполняется. Функция `awaitConfirmBarrier(action, orderId)` взводит состояние ожидания в ограниченной `Map<string, number>`, бот возвращает alert в Telegram (`REQUIRES_CONFIRMATION`): *"⚠️ Нажмите ещё раз в течение 30 секунд для подтверждения"*.
    - 2-й клик (в течение 30с): функция возвращает `CONFIRMED`, состояние очищается, мутация выполняется через CAS `scheduleVersion`.
    - Клик по истечении 30с: состояние считается протухшим, возвращается `REQUIRES_CONFIRMATION` и взводится новое 30-секундное окно.
    - Повторный клик после успешного исполнения: CAS возвращает `ALREADY_PROCESSED`.

## D5. Client linking & Callback Routing: **TgLink с составным ключом**

- **Decision**:
  - Коллекция `TgLink`: `chatId: text`, `orderId: number`, `createdAt: timestamp`. Составной индекс: `UNIQUE (chat_id, order_id)`.
  - Deep-link `/start <accessToken>` на client-боте: валидация `accessToken` через таблицу `orders` → идемпотентная вставка связки `(chatId, orderId)`. Составная уникальность позволяет одному клиенту иметь несколько активных или последовательных записей без перезаписи старых связей.
  - **Callback routing**: Все клиентские инлайн-кнопки несут идентификатор заказа в `callback_data` (`c:ack:<orderId>`, `c:dec:<orderId>`). Хендлер извлекает `orderId`, проверяет наличие связи `(chatId, orderId)` в `TgLink` и проверяет `Blacklist`.
  - **Доменный шов отмены клиентом**: Поскольку `cancelBooking` требует сырой одноразовый `cancelToken` (отсутствующий в БД), добавляется метод `cancelBookingByClientChat(payload, { orderId, chatId, now })`:
    1. Проверяет наличие `TgLink (chatId, orderId)`.
    2. Выполняет транзакционную отмену с advisory lock `resource_slot_cancel_{id}`.
    3. Применяет политику возвратов 003: если отмена до cutoff (`now < startTime - cancellationCutoffHours`) — инициирует возврат через Stripe Refund API (Order `refunded`); если после cutoff — переводит Order в `refund_requested`.
    4. Записывает аудит `booking.cancel-by-telegram`.
    5. Ставит в `TelegramOutbox` оповещение персоналу (`bot: 'staff'`, `priority: 50`).

## D6. GDPR: **redaction по sentMessageId + nightly purge job**

- **Decision**:
  - На терминальном переходе брони (RELEASED/completed/cancelled) вызывается хелпер `redaction.ts`: находит все строки `telegram_outbox`, где `aggregateType = 'BOOKING'`, `aggregateId = reservationId`, `bot = 'staff'`, `status = 'sent'` и `sentMessageId IS NOT NULL`.
  - Для каждой найденной карточки ставит в outbox задачу:
    `actionType: 'editMessageText'`, `messageId: sentMessageId`, `toChatId: toChatId`, `text: '[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]'`, `replyMarkupJson: null`, `priority: 100` (CRITICAL).
  - Nightly Payload Job `gdpr-purge` (раз в сутки):
    - Удаляет записи `TgLink`, чей связанный `orders.status` находится в терминальном состоянии (`completed`, `cancelled`, `refunded`) более 90 дней (±1 день BVA).
    - Очищает `metaJson` и тело `telegram_outbox` для строк старше 30 дней.

## D7. Staff reschedule & Fallback для непривязанных клиентов

- **Decision**:
  - Новая функция доменного сервиса `issueRescheduleToken(payload, {reservationId, actorId})`: новый nonce → `UPDATE slot_reservations SET reschedule_token_hash = $h, schedule_version = schedule_version + 1` (CAS + advisory lock) + audit `booking.reschedule-token-issued`.
  - **Fallback при отсутствии Telegram-связки**:
    - Если `TgLink` для `orderId` существует: формирует URL `${SERVER_URL}/booking/reschedule?bookingId=${reservationId}&token=${nonce}` и отправляет через `clientBot` в `TelegramOutbox` (`priority: 10`).
    - Если клиент не привязан к боту: ссылка возвращается staff-оператору в Telegram alert (`show_alert: true`) с сообщением *"Клиент не подключил Telegram. Ссылка для переноса: <url>"* и при наличии `customerEmail` ставится email-задача `booking-email` в очередь Payload Jobs.
  - Время записи бот напрямую НЕ меняет (US3 канон).

## D8. Bot-инфраструктура: **botManager + graceful lifecycle**

- **Decision**: `src/lib/telegram/botManager.ts` — ленивая инициализация двух grammY-инстансов по env-токенам; `waitForBots(timeout)` для деплой-хука; healthcheck-метод; при отсутствии токенов боты деградируют в no-op (вебхуки отвечают 200+лог, outbox копит — ничего не теряется). Строки бота — `botStrings` по `ShopSettings.defaultLocale` (новое поле, ru/en), без per-staff override.
- **Rationale**: деплой без секретов Telegram не должен ронять приложение (white-label: бот опционален); PII в логах — дени-лист.

## D9. Интеграция Staff Pager в `createBooking`

- **Decision**:
  - При успешном создании брони в `src/lib/booking/bookingService.ts` (`createBooking`) после коммита транзакции инициируется отправка карточки пейджера:
    - Извлекаются staff-чаты из `ShopSettings.staffChatIds` (L1) или fallback на `TELEGRAM_STAFF_CHAT_IDS` (L2).
    - Для каждого staff-чата создается запись в `TelegramOutbox`: `bot: 'staff'`, `actionType: 'sendMessage'`, `toChatId: chatId`, `priority: 50` (HIGH), `text: formatStaffCard(booking, settings.timeZone)`, `replyMarkupJson: staffCardButtons(reservationId, scheduleVersion)`, `aggregateType: 'BOOKING'`, `aggregateId: String(reservationId)`.
    - Ошибки постановки в очередь Telegram логируются без отката самой брони (по аналогии с email-очередью).
