# Research: 004-telegram-bots

> Plan Phase 0 — Engineering Decisions (D1–D8). Grounding: 002+003 as-built (`c5f3bf1`, `3697b3d`) + Payload Jobs контракт (дистрибутив прочитан, L1).

## D1. Telegram-фреймворк: **grammY** (единственный новый dep)

- **Decision**: `grammy` (self-contained, без плагинов runner/врат). Webhook-режим: `webhookCallback(bot, 'stdlib')`-эквивалент вручную — свой Next-роут вызывает `bot.handleUpdate(update)` после проверки secret-token.
- **Rationale**: raw Bot API = ручной парсинг 30+ типов update, callback-query типизация, retry-политика — дороже одного dep; альтернативы: Telegraf (аккумулированный легаси-выбор проигрывает grammY по типизации/поддержке), свой клиент (непрозрачность). NFR-402 фиксирует ровно один dep.
- **Alternatives**: Telegraf; raw fetch-клиент.
- **Spike Governance**: не требуется (webhook + handleUpdate проверяются интеграционными тестами с фейковым Bot API-сервером — mock fetch, без сети).

## D2. Outbox-модель и dispatch: **Payload Job + CAS-claim**

- **Decision**: коллекция `TelegramOutbox` (toChatId, text, priority int, status: queued|sending|sent|failed|dead, leaseUntil, attempts, lastError, availableAt для 429-cooldown, metaJson PII-redacted). Dispatch — Payload Job `outbox-dispatch` с 6-field cron `*/30 * * * * *` (каждые 30 c; Payload поддерживает 6-field cron — docs), батч ≤ 25: атомарный claim `UPDATE telegram_outboxes SET status='sending', lease_until=now()+interval '30 seconds' WHERE id IN (…queued, lease free, available_at ≤ now, ORDER BY priority DESC, created_at ASC LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING` → отправка через bot.api → sent / ошибка классифицируется (429 → available_at = now()+retry_after, статус queued; PERMANENT (chat not found/blocked) → dead + staff-alert; TRANSIENT → queued, attempts+1, после 5 попыток → dead).
- **Rationale**: SKIP LOCKED — атомарный межворкерный claim без advisory-расширения; Payload Jobs lease закрывает рестарт-дубль (canon 003 D1); starvation boost реализуется в ORDER BY: `priority + CASE WHEN created_at < now()-interval '5 minutes' THEN 10 ELSE 0 END DESC`.
- **Alternatives**: advisory-lock claim (уже канон 002, но SKIP LOCKED проще и стандартен); pg-boss (новый dep — против NFR-402).

## D3. Webhook security: **timing-safe secret + fail-closed**

- **Decision**: оба роута сверяют `X-Telegram-Bot-Api-Secret-Token` с env (`TELEGRAM_STAFF_WEBHOOK_SECRET` / `TELEGRAM_CLIENT_WEBHOOK_SECRET`) через `timingSafeEqual`; секрет отсутствует → 403 на всё (fail-closed, канон 001 F-03); ошибка инициализации бота → 200 + лог деградации (Telegram не ретраит, урок 007 F-06).
- **Rationale**: timing-safe исключает побайтовый oracle; 200-деградация ломает retry storm.

## D4. Staff-авторизация: **3 уровня, без новых таблиц**

- **Decision**: chatId авторизован, если: (L1) ∈ `ShopSettings.staffChatIds` (новое поле, multiText) ИЛИ (L2) ∈ env `TELEGRAM_STAFF_CHAT_IDS` (csv) ИЛИ (L3) chatId == чату, куда карточка была отправлена (callback.message.chat.id == карточке-чату). Деструктив (reject/blacklist) — confirm-barrier 30s: ин-мемори Map `chatId:action:messageId → until`, второй клик в окне → идемпотентный ACK.
- **Rationale**: L3 — операциональное определение «1:1 chat» из аудита; три уровня соответствуют легаси-канону без новых таблиц.

## D5. Client linking: **TgLink через deep-link**

- **Decision**: коллекция `TgLink` (chatId unique, orderId, createdAt). `/start <accessToken>` на client-боте: accessToken валиден (orders.access_token lookup) → upsert TgLink (повторный /start того же order — идемпотентен). Дальше все клиентские callbacks матчатся по chatId → TgLink → booking. Blacklist-проверка перед любой мутацией.
- **Rationale**: accessToken уже у клиента (страница 003); chatId — PII → purge-канон FR-404.

## D6. GDPR: **redaction через outbox CRITICAL + nightly purge job**

- **Decision**: на терминальном переходе брони (RELEASED/terminal) enqueue `editMessageText`-задачу с CRITICAL=100 (замена текста карточки на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`, chatId сохраняется в outbox-метаданных до отправки, затем outbox-строки старше 30d удаляются тем же nightly job'ом). Nightly Payload Job `gdpr-purge` (cron раз в сутки): TgLink, у которых связанный order терминален > 90 дней (±1 день BVA) → delete; outbox-метаданные > 30d → delete.
- **Rationale**: outbox гарантирует доставку редакции даже при недоступном Telegram; 90d — канон легаси.

## D7. Staff reschedule: **re-issue токена сервисом**

- **Decision**: новая функция доменного сервиса `issueRescheduleToken(payload, {reservationId, actorId})`: новый nonce → `UPDATE slot_reservations SET reschedule_token_hash = $h, schedule_version = schedule_version + 1` (CAS + advisory lock) + audit `booking.reschedule-token-issued`; deep-link клиенту доставляется через outbox (NORMAL). Время бот НЕ мутирует (канон US3).
- **Rationale**: 003 выдаёт токен только при бронировании; re-issue закрывает «ссылка истекла/потеряна» без ручного вмешательства в БД.

## D8. Bot-инфраструктура: **botManager + graceful lifecycle**

- **Decision**: `src/lib/telegram/botManager.ts` — ленивая инициализация двух grammY-инстансов по env-токенам; `waitForBots(timeout)` для деплой-хука; healthcheck-метод; при отсутствии токенов боты деградируют в no-op (вебхуки отвечают 200+лог, outbox копит — ничего не теряется). Строки бота — `botStrings` по `ShopSettings.defaultLocale` (новое поле, ru/en), без per-staff override.
- **Rationale**: деплой без секретов Telegram не должен ронять приложение (white-label: бот опционален); PII в логах — дени-лист.
