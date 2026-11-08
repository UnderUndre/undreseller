# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `004-telegram-bots`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 as-built (`c5f3bf1`) + 003 as-built (`3697b3d`)
**Статус:** **DRAFT — REVISION 1.2 (2026-11-08; review fixes: F1 Outbox primitives [bot/actionType/messageId/replyMarkup/sentMessageId], F2 createBooking pager enqueue & GDPR redaction tracking, F3 cancelBookingByClientChat seam, F4 staffChatIds field access control, F5 CTE SKIP LOCKED, F6 autoRun 30s limit 25, F7 two-press confirm barrier, F8 TgLink composite uniqueness & callback routing, F9 Blacklist phone/chatId schema, F10 partial queue index, F11 complete status guards, F12 reschedule unlinked fallback)**
**Source of truth по бизнесу:** план v2.5.0 §2.2 (уведомление в Telegram — финал сквозного процесса); ICP-канал №1
**Grounding (002+003 as-built):** grammY нет в deps; Blacklist/TgLink/TelegramOutbox отсутствуют; `ShopSettings` без staffChatIds/defaultLocale; reschedule-токен выдаётся один раз при бронировании; FSM без FULFILLED (orders: processing/completed/cancelled/refunded + 4 статуса 003); email-канал 003 не зависит от outbox

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Оператор узнаёт о бронях, заходя в админку; клиент confirmation-кнопками не пользуется. Легаси отработало этот контур до прод-уровня (crown jewel #3) — перенос дизайна: durable outbox вместо прямых отправок, CAS-действия вместо «нажал и молимся», PII-редакция по GDPR.

### 1.2. Решение

Два бота (staff pager + client confirmation) на grammY, вся исходящая Telegram-графика через **durable outbox** (атомарные 30s leases, приоритеты, 429-cooldown, типизированные примитивы `bot`, `actionType`, `messageId`, `replyMarkupJson`), staff-действия через **CAS `scheduleVersion`** c 2-шаговым confirm-barrier (`REQUIRES_CONFIRMATION` → `CONFIRMED`), magic-reschedule доставляется ботом (включая staff re-issue токена с fallback-ссылкой), клиентский decline исполняется через специализированный доменный шов `cancelBookingByClientChat` с политикой возвратов 003. Порт design-reimplementation, не copy-paste.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO PAYMENTS IN BOTS:** Stars/инвойсы в чате — 006+ (платёжные адаптеры после 005).
* ❌ **NO GOOGLE CALENDAR:** 005.
* ❌ **NO BROADCAST-МАРКЕТИНГ:** промо-рассылки — Via Negativa (модель агрегатора отвергнута).
* ❌ **NO RAW SEND:** ни одной прямой `sendMessage`/`editMessageText` в обход outbox (кроме answerCallbackQuery — мгновенный ACK кнопки, не несёт данных).
* ❌ **NO EMAIL THROUGH OUTBOX:** email остаётся на Resend-jobs канона 003 (аутбаунд-граница: outbox = Telegram-only).

---

## 2. User Stories (Prioritized)

### US1 — Dual-bot инфраструктура + webhook hygiene (P0)

`STAFF_BOT_TOKEN` + `CLIENT_BOT_TOKEN` (grammY), webhook-роуты `/api/telegram/staff/webhook` и `/api/telegram/client/webhook` с `X-Telegram-Bot-Api-Secret-Token` (timing-safe, канон 007), botManager с healthcheck, graceful shutdown.

**Acceptance**: неверный secret → 403 + 0 обработки; bot init fail → вебхук отвечает 200 с деградацией-логом (Telegram не ретраит storm'ом — урок 007 F-06).

### US2 — Durable outbox (P0 — crown jewel)

`TelegramOutbox` (Payload-коллекция): enqueue → атомарный claim 30s lease через PostgreSQL CTE с `FOR UPDATE SKIP LOCKED` → отправка через соответствующего бота (`bot: 'staff' | 'client'`) и метод (`actionType: 'sendMessage' | 'editMessageText' | 'editMessageReplyMarkup'`) → сохранение `sentMessageId` при успехе → 429 `retry_after` cooldown → приоритеты (`CRITICAL=100` GDPR-редакция, `HIGH=50` staff pager / client alerts, `NORMAL=10`) → классификация ошибок (PERMANENT_NO_OP / RATE_LIMIT_429 / TRANSIENT) → starvation boost (ожидание > 5 мин → приоритет +10). Dispatch — Payload Job каждые 30 c (крон `*/30 * * * * *`, батч ≤ 25/тик, упорядочивание priority DESC, createdAt ASC; партиальный индекс `WHERE status = 'queued'`). В `payload.config.ts` рантайм `jobs.autoRun` синхронизирован: `[{ cron: '*/30 * * * * *', queue: 'default', limit: 25 }]`.

**Acceptance**: steady-state p95 доставки ≤ 60 c при ≤50 msg/min; burst 1000 → drain ≤ 20 мин, **0 потерь / 0 дублей**; killed worker → lease истекает, сообщение не теряется и не дублируется (atomic claim).

### US3 — Staff pager + CAS-действия (P0)

При создании брони (`createBooking`) staff pager карточка заказа (контакты маскированы, notes-индикатор без текста, услуги/длительность/слот в TZ инстанса) автоматически отправляется в outbox (`priority: 50`, `bot: 'staff'`) для всех staff-чатов + inline-кнопки approve/reject/reschedule/**complete**/blacklist. Авторизация 3-уровневая (L1 `ShopSettings.staffChatIds` со строгим `adminOnlyFieldAccess` на чтение/запись → L2 env `TELEGRAM_STAFF_CHAT_IDS` → L3 чат карточки: callback принимается только из чата, куда карточка отправлена).
Confirm-barrier на деструктив (reject/blacklist): 2-шаговый (`awaitConfirmBarrier`) — 1-й клик взводит барьер на 30s и выдает всплывающее предупреждение (`REQUIRES_CONFIRMATION`), 2-й клик в течение 30s подтверждает (`CONFIRMED`) и запускает мутацию; клик после таймаута взводит заново.
Все переходы через CAS `scheduleVersion` + FSM доменного сервиса (001/002 канон).
**«Complete» — order-level действие**: доступно только для заказов в статусе `processing` при активной брони `BOOKED` → переводит Order → `completed` + AuditEvent (повторный клик → `ALREADY_PROCESSED`, отмененные/возвращенные заказы → `INVALID_STATE`).
Staff reschedule: вызывает `issueRescheduleToken` (новый nonce, CAS bump scheduleVersion + advisory lock, audit); deep-link отправляется клиенту через outbox (если `TgLink` привязан); если клиент не привязан к боту, ссылка возвращается staff-оператору в чат и дублируется на email.

**Acceptance**: двойной клик approve → второй `ALREADY_PROCESSED`; неавторизованный клик → alert + 0 мутаций; reject без повторного подтверждения за 30s → 0 мутаций; reschedule → staff re-issue magic-link (003 канон) без мутирования времени ботом.

### US4 — Client confirmation bot (P1)

Привязка: клиент из confirmation-письма/страницы переходит по deep-link `t.me/<client_bot>?start=<accessToken>` → `/start` хендлер валидирует `accessToken` и создаёт связь `TgLink (chatId, orderId)` с составным уникальным индексом `UNIQUE (chat_id, order_id)` (chatId = PII). Клиентские кнопки несут `orderId` в callback_data (`c:ack:<orderId>`, `c:dec:<orderId>`).
- Confirm: `acknowledgeBooking` CAS bump (канон 003), повторный клик → `ALREADY_PROCESSED`.
- Decline: вызывает доменный шов `cancelBookingByClientChat(payload, { orderId, chatId, now })` → валидация связки `TgLink` → перевод FSM `CUSTOMER_CANCEL` → `RELEASED` → исполнение политики возвратов 003 (авто-возврат при отмене до cutoff, заявка `refund_requested` после cutoff) → аудит `booking.cancel-by-telegram` → staff alert (outbox HIGH).
- 24h cooldown анти-спам (per chatId + action).
- Blacklist enforcement: клиенты в `Blacklist` (по `chatId` или `phone`) получают 403 на callbacks, кнопки не рендерятся, существующая клавиатура очищается через `editMessageReplyMarkup` в outbox.

**Acceptance**: confirm инкрементирует scheduleVersion ровно один раз на гонке; decline → RELEASED + Stripe refund / refund_requested по cutoff + staff alert (outbox HIGH); повторные брони одного клиента не перезаписывают предыдущие ссылки.

### US5 — GDPR-редакция и retention (P1)

Терминальный переход брони (RELEASED / completed / cancelled) → `redaction.ts` находит все отправленные карточки пейджера по `aggregateType = 'BOOKING'` и `aggregateId = reservationId` со сохраненными `toChatId` и `sentMessageId` → формирует outbox-задачи `editMessageText` с `CRITICAL=100` (замена текста на `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`, `replyMarkupJson: null`; fail → retry outbox).
`TgLink`-purge: nightly Payload Job `gdpr-purge` удаляет записи `TgLink`, чей заказ завершен/отменен более 90 дней назад (BVA 90d ±1 день).
Телефон всегда маскирован в карточке (`+7••• ••• •• 45`).

**Acceptance**: redaction-fail → retry через outbox CRITICAL-приоритет; purge-тест на 90d границе (±1 день BVA).

---

## 3. Edge Cases

- **Telegram webhook retry storm** при 5xx → отвечаем 200 на некритичных ошибках (урок 007 F-06), ретраи — outbox.
- **Двухшаговый confirm-barrier**: 1-й клик взводит подтверждение, 2-й клик в окне 30s исполняет, повторный клик после завершения → `ALREADY_PROCESSED`.
- **Blacklist-клиент**: блокировка поддерживается как по `chatId`, так и по `phone` (для клиентов без Telegram); старые кнопки очищаются через `editMessageReplyMarkup`.
- **Bot down при деплое**: waitForBots-таймаут → вебхук 200 + отложенная обработка.
- **429 от Telegram**: `retry_after` парсится, cooldown до истечения, сообщение НЕ теряется.
- **Starvation**: сообщение с NORMAL-приоритетом, ждущее > 5 мин, получает boost +10 (не обгоняет CRITICAL).
- **Часовые пояса**: слот в карточке — в TZ инстанса (`ShopSettings.timeZone`, канон 002 US3).
- **Клиент без Telegram при Reschedule**: staff bot отображает ссылку на перенос в alert и дублирует на email.
- **Повторные записи одного клиента**: составной ключ `UNIQUE (chat_id, order_id)` исключает затирание ссылок.

---

## 4. Requirements

### Functional Requirements
- **FR-401 (Outbox)**: durable Telegram-очередь с lease 30s/приоритетами (CRITICAL=100, HIGH=50, NORMAL=10)/429-cooldown/классификацией ошибок/starvation boost (+10 после 5 мин). Поля: `bot ('staff'|'client')`, `actionType ('sendMessage'|'editMessageText'|'editMessageReplyMarkup')`, `toChatId`, `text`, `messageId?`, `replyMarkupJson?`, `sentMessageId?`, `aggregateType`, `aggregateId`. Единственный путь **Telegram**-исходящих (email — Resend-jobs 003); dispatch — Payload Job каждые 30 c, батч ≤ 25; партиальный индекс `WHERE status = 'queued'`.
- **FR-402 (Staff pager)**: авто-отправка карточки при `createBooking` для всех staff-чатов + 5 CAS-действий (approve/reject/reschedule/complete/blacklist) + 2-шаговый confirm-barrier 30s + 3-уровневая авторизация; `ShopSettings.staffChatIds` защищён `adminOnlyFieldAccess`; complete = order-level (`completed` + audit, только для `processing`).
- **FR-403 (Client bot)**: confirm/decline (acknowledgement/доменный шов `cancelBookingByClientChat` с политикой возвратов 003) + reschedule-link delivery (с fallback в staff alert) + 24h cooldown + blacklist enforcement; staff re-issue reschedule-токена (новый nonce, CAS bump, audit).
- **FR-404 (GDPR)**: редакция карточки на терминале через `editMessageText` (CRITICAL outbox) по сохранённым `sentMessageId`, TgLink purge 90d после терминала (nightly job), маскировка телефона в карточках.
- **FR-405 (Webhook security)**: secret-token timing-safe per-bot, fail-closed при отсутствующем секрете, 200-деградация при bot-init fail.
- **FR-406 (Blacklist)**: коллекция `Blacklist` (`chatId?`, `phone?`, `reason`, `createdBy`; валидация: хотя бы один идентификатор задан; партиальные уникальные индексы). Enforcement: client-bot callbacks → 403 + 0 мутаций, кнопки не рендерятся, старая клавиатура очищается (`editMessageReplyMarkup` через outbox), staff-bot может заносить (confirm-barrier).
- **FR-407 (Tg-linking)**: `TgLink (chatId, orderId, createdAt)` с составным индексом `UNIQUE (chat_id, order_id)`; привязка через deep-link `/start <accessToken>`; callback_data несёт `orderId` (`c:ack:<orderId>`, `c:dec:<orderId>`); unlink при purge.
- **FR-408 (Dispatch worker)**: атомарный claim через CTE с `FOR UPDATE SKIP LOCKED` (`WITH batch AS (...) UPDATE telegram_outbox ... FROM batch RETURNING ...`), фиксация `sentMessageId` при успехе `sendMessage`, идемпотентность при рестарте, PERMANENT_NO_OP-маркировка без ретраев (с записью в `AuditEvents`).

### Non-Functional Requirements
- **NFR-401**: 129+ старых тестов зелёные + ≥20 новых (outbox lease/race, CAS-матрица, auth-матрица, redaction, purge BVA, CTE claim, confirm-barrier two-press).
- **NFR-402**: ровно 1 новый dep — grammY (обоснование в плане D1: raw Bot API webhook/retry/типизация дороже; альтернативы рассмотрены).
- **NFR-403**: PII (телефон, имена, chatId) в логах — 0 (дени-лист канон); chatId хранится только в TgLink/Blacklist/outbox-метаданных; `ShopSettings.staffChatIds` недоступен публично.
- **NFR-404**: ≤500 MB при dispatch-нагрузке (fencing-инвариант; замер в evidence, допускается перенос на qa-signoff как в 003).

## 5. Success Criteria

- **SC-001**: outbox — steady-state p95 ≤ 60 c при ≤50 msg/min; burst 1000 → drain ≤ 20 мин; kill worker → 0 потерь, 0 дублей; CTE claim исключает ошибки expression subquery.
- **SC-002**: CAS-матрица действий (5 × повтор/гонка) — 0 двойных применений; двухшаговый confirm-barrier надёжно блокирует случайный деструктив на 1-м клике.
- **SC-003**: auth-матрица 3 уровней × 5 действий + blacklist-матрица (chatId/phone) — 0 несанкционированных мутаций; staffChatIds закрыт от публичного чтения.
- **SC-004**: redaction/purge — 0 PII в БД/логах/Telegram-карточках после терминала+90d (BVA 90d ±1 день); все отправленные карточки гарантированно отредактированы по `sentMessageId`.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: grammY | **Да** — канон легаси, единственный новый dep | Raw Bot API дороже (webhook/retry/типизация); альтернативы в плане D1 |
| Q2: Один бот или два | **Два** (staff/client) — разделение секретов и прав | Legacy канон; один бот = PR-путаница |
| Q3: WhatsApp-канал | **Нет** (Cloud API был в легаси — отложить) | Один канал за спеку; SMS/WhatsApp — после 005 |
| Q4: Подтверждение клиентом | Кнопки + fallback-ссылка | Бот может быть заблокирован — email-канон 003 остаётся |
| Q5: «fulfill»-семантика | **Order-level `completed` + AuditEvent** (только для `processing`) | Аудит C1 + Review F11: FSM не имеет FULFILLED; бронь остаётся BOOKED |
| Q6: Outbox vs email | **Outbox = Telegram-only** | Аудит C2-scope: email — Resend-jobs 003, границы каналов не смешиваются |
| Q7: Привязка клиента | **Deep-link `/start <accessToken>` → TgLink с `UNIQUE (chatId, orderId)`** | Аудит B2 + Review F8: поддержка повторных броней без затирания |
| Q8: Клиентский отказ | **Доменный шов `cancelBookingByClientChat`** | Review F3: `cancelBooking` требует сырой cancelToken; клиентский бот исполняет отмену по `(chatId, orderId)` с соблюдением политики возвратов 003 |
| Q9: Примитивы Outbox | **`bot`, `actionType`, `messageId`, `replyMarkupJson`, `sentMessageId`** | Review F1/F2: явное разделение ботов, поддержка `editMessageText`/`editMessageReplyMarkup`, сохранение ID сообщений для GDPR |
