# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `004-telegram-bots`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 as-built (`c5f3bf1`) + 003 as-built (`3697b3d`)
**Статус:** **DRAFT — REVISION 1.1 (2026-11-08; clarify: C1 fulfill→order-level, C2 outbox=Telegram-only, C3 confirm=acknowledgement, B1 FR-406 Blacklist, B2 FR-407 Tg-linking, SC-001 физика очереди)**
**Source of truth по бизнесу:** план v2.5.0 §2.2 (уведомление в Telegram — финал сквозного процесса); ICP-канал №1
**Grounding (002+003 as-built):** grammY нет в deps; Blacklist/TgLink/TelegramOutbox отсутствуют; `ShopSettings` без staffChatIds/defaultLocale; reschedule-токен выдаётся один раз при бронировании; FSM без FULFILLED (orders: processing/completed/cancelled/refunded + 4 статуса 003); email-канал 003 не зависит от outbox

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Оператор узнаёт о бронях, заходя в админку; клиент confirmation-кнопками не пользуется. Легаси отработало этот контур до прод-уровня (crown jewel #3) — перенос дизайна: durable outbox вместо прямых отправок, CAS-действия вместо «нажал и молимся», PII-редакция по GDPR.

### 1.2. Решение

Два бота (staff pager + client confirmation) на grammY, вся исходящая Telegram-графика через **durable outbox** (атомарные 30s leases, приоритеты, 429-cooldown), staff-действия через **CAS `scheduleVersion`** c confirm-barrier, magic-reschedule доставляется ботом (включая staff re-issue токена). Порт design-reimplementation, не copy-paste.

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

`TelegramOutbox` (Payload-коллекция): enqueue → атомарный claim 30s lease → отправка → 429 `retry_after` cooldown → приоритеты (`CRITICAL=100` GDPR-редакция, `HIGH=50` staff pager, `NORMAL=10`) → классификация ошибок (PERMANENT_NO_OP / RATE_LIMIT_429 / TRANSIENT) → starvation boost (ожидание > 5 мин → приоритет +10). Dispatch — Payload Job с секундным кроном (каждые 30 c, батч ≤ 25/тик, упорядочивание priority DESC, createdAt ASC).

**Acceptance**: steady-state p95 доставки ≤ 60 c при ≤50 msg/min; burst 1000 → drain ≤ 20 мин, **0 потерь / 0 дублей**; killed worker → lease истекает, сообщение не теряется и не дублируется (atomic claim).

### US3 — Staff pager + CAS-действия (P0)

Карточка заказа (контакты маскированы, notes-индикатор без текста, услуги/длительность/слот) + inline-кнопки approve/reject/reschedule/**complete**/blacklist; авторизация 3-уровневая (L1 `ShopSettings.staffChatIds` → L2 env `TELEGRAM_STAFF_CHAT_IDS` → L3 чат карточки: callback принимается только из чата, куда карточка отправлена); confirm-barrier 30s на деструктив (reject/blacklist); все переходы через CAS `scheduleVersion` + FSM доменного сервиса (001/002 канон). **«Complete» — order-level действие**: Order → `completed` + AuditEvent, бронь остаётся BOOKED (FSM не затронут — FSM не имеет FULFILLED).

**Acceptance**: двойной клик approve → второй `ALREADY_PROCESSED`; неавторизованный клик → alert + 0 мутаций; reschedule → staff re-issue magic-link (003 канон) без мутирования времени ботом.

### US4 — Client confirmation bot (P1)

Привязка: клиент из confirmation-письма/страницы переходит по deep-link `t.me/<client_bot>?start=<accessToken>` → `/start` хендлер создаёт `TgLink (chatId unique, orderId)` (chatId = PII). Клиентский confirm/decline callback (confirm = acknowledgement CAS bump — канон 003; decline → FSM `CUSTOMER_CANCEL` → RELEASED + staff alert), magic-reschedule delivery, 24h cooldown анти-спам, blacklist enforcement (кнопки скрыты, 403 на попытку).

**Acceptance**: confirm инкрементирует scheduleVersion ровно один раз на гонке; decline → RELEASED + staff alert (outbox HIGH).

### US5 — GDPR-редакция и retention (P1)

Терминальный переход → `editMessageText` карточки с `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]` (outbox CRITICAL-приоритет; fail → retry); `TgLink`-purge 90d после терминала брони (nightly Payload Job); телефон всегда маскирован в карточке (`+7••• ••• •• 45`).

**Acceptance**: redaction-fail → retry через outbox CRITICAL-приоритет; purge-тест на 90d границе (±1 день BVA).

---

## 3. Edge Cases

- **Telegram webhook retry storm** при 5xx → отвечаем 200 на некритичных ошибках (урок 007 F-06), ретраи — outbox.
- **Гонка confirm-barrier**: второй клик в окне 30s → идемпотентный ответ.
- **Blacklist-клиент**: старые кнопки мертвы (editMessageReplyMarkup — очистка через outbox).
- **Bot down при деплое**: waitForBots-таймаут → вебхук 200 + отложенная обработка через inbox.
- **429 от Telegram**: `retry_after` парсится, cooldown до истечения, сообщение НЕ теряется.
- **Starvation**: сообщение с NORMAL-приоритетом, ждущее > 5 мин, получает boost +10 (не обгоняет CRITICAL).
- **Часовые пояса**: слот в карточке — в TZ инстанса (канон 002 US3).

## 4. Requirements

### Functional Requirements
- **FR-401 (Outbox)**: durable Telegram-очередь с lease 30s/приоритетами (CRITICAL=100, HIGH=50, NORMAL=10)/429-cooldown/классификацией ошибок/starvation boost (+10 после 5 мин) — единственный путь **Telegram**-исходящих (email — Resend-jobs 003); dispatch — Payload Job каждые 30 c, батч ≤ 25.
- **FR-402 (Staff pager)**: карточка + 5 CAS-действий (approve/reject/reschedule/complete/blacklist) + confirm-barrier 30s + 3-уровневая авторизация; complete = order-level (`completed` + audit, вне FSM).
- **FR-403 (Client bot)**: confirm/decline (acknowledgement/FSM cancel) + reschedule-link delivery + 24h cooldown + blacklist enforcement; staff re-issue reschedule-токена (новый nonce, CAS bump, audit).
- **FR-404 (GDPR)**: редакция карточки на терминале (CRITICAL outbox), TgLink purge 90d после терминала (nightly job), маскировка телефона в карточках.
- **FR-405 (Webhook security)**: secret-token timing-safe per-bot, fail-closed при отсутствующем секрете, 200-деградация при bot-init fail.
- **FR-406 (Blacklist)**: коллекция `Blacklist` (chatId, phone?, reason, createdBy); enforcement: client-bot callbacks → 403 + 0 мутаций, кнопки не рендерятся, старая клавиатура очищается (outbox), staff-bot может заносить (confirm-barrier).
- **FR-407 (Tg-linking)**: `TgLink (chatId unique, orderId, createdAt)`; привязка через deep-link `/start <accessToken>`; unlink при purge; повторный /start по тому же order — идемпотентный.
- **FR-408 (Dispatch worker)**: атомарный claim (`status='queued' AND (lease_until IS NULL OR lease_until < now())` → `status='sending', lease_until=now()+30s` CAS-UPDATE), идемпотентность при рестарте, PERMANENT_NO_OP-маркировка без ретраев.

### Non-Functional Requirements
- **NFR-401**: 129+ старых тестов зелёные + ≥20 новых (outbox lease/race, CAS-матрица, auth-матрица, redaction, purge BVA).
- **NFR-402**: ровно 1 новый dep — grammY (обоснование в плане D1: raw Bot API webhook/retry/типизация дороже; альтернативы рассмотрены).
- **NFR-403**: PII (телефон, имена, chatId) в логах — 0 (дени-лист канон); chatId хранится только в TgLink/Blacklist/outbox-метаданных.
- **NFR-404**: ≤500 MB при dispatch-нагрузке (fencing-инвариант; замер в evidence, допускается перенос на qa-signoff как в 003).

## 5. Success Criteria

- **SC-001**: outbox — steady-state p95 ≤ 60 c при ≤50 msg/min; burst 1000 → drain ≤ 20 мин; kill worker → 0 потерь, 0 дублей.
- **SC-002**: CAS-матрица действий (5 × повтор/гонка) — 0 двойных применений.
- **SC-003**: auth-матрица 3 уровней × 5 действий + blacklist-матрица — 0 несанкционированных мутаций.
- **SC-004**: redaction/purge — 0 PII в БД/логах после терминала+90d (BVA 90d ±1 день).

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: grammY | **Да** — канон легаси, единственный новый dep | Raw Bot API дороже (webhook/retry/типизация); альтернативы в плане D1 |
| Q2: Один бот или два | **Два** (staff/client) — разделение секретов и прав | Legacy канон; один бот = PR-путаница |
| Q3: WhatsApp-канал | **Нет** (Cloud API был в легаси — отложить) | Один канал за спеку; SMS/WhatsApp — после 005 |
| Q4: Подтверждение клиентом | Кнопки + fallback-ссылка | Бот может быть заблокирован — email-канон 003 остаётся |
| Q5: «fulfill»-семантика | **Order-level `completed` + AuditEvent** (вне FSM) | Аудит C1: FSM не имеет FULFILLED; бронь остаётся BOOKED |
| Q6: Outbox vs email | **Outbox = Telegram-only** | Аудит C2-scope: email — Resend-jobs 003, границы каналов не смешиваются |
| Q7: Привязка клиента | **Deep-link `/start <accessToken>` → TgLink** | Аудит B2: явный механизм, chatId = PII (purge-канон) |
