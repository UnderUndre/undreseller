# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `004-telegram-bots`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002 + 003
**Статус:** **DRAFT — REVISION 1.0 (2026-11-07; sketch — port-map #6, crown jewel #3: durable outbox + CAS staff actions + magic-reschedule)**
**Source of truth по бизнесу:** план v2.5.0 §2.2 (уведомление в Telegram — финал сквозного процесса); ICP-канал №1

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

Оператор узнаёт о бронях, заходя в админку; клиент confirmation-кнопками не пользуется. Легаси отработало этот контур до прод-уровня (crown jewel #3) — перенос дизайна: durable outbox вместо прямых отправок, CAS-действия вместо «нажал и молимся», PII-редакция по GDPR.

### 1.2. Решение

Два бота (staff pager + client confirmation) на grammY, вся исходящая графика через **durable outbox** (атомарные 30s leases, приоритеты, 429-cooldown), staff-действия через **CAS `scheduleVersion`** c confirm-barrier, magic-reschedule доставляется ботом. Порт design-reimplementation, не copy-paste.

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO PAYMENTS IN BOTS:** Stars/инвойсы в чате — 006+ (платёжные адаптеры после 005).
* ❌ **NO GOOGLE CALENDAR:** 005.
* ❌ **NO BROADCAST-МАРКЕТИНГ:** промо-рассылки — Via Negativa (модель агрегатора отвергнута).
* ❌ **NO RAW SEND:** ни одной прямой `sendMessage` в обход outbox (кроме answerCallbackQuery).

---

## 2. User Stories (Prioritized)

### US1 — Dual-bot инфраструктура + webhook hygiene (P0)

`STAFF_BOT_TOKEN` + `CLIENT_BOT_TOKEN` (grammY), webhook-роуты с `X-Telegram-Bot-Api-Secret-Token` (timing-safe, канон 007), botManager с healthcheck, graceful shutdown.

**Acceptance**: неверный secret → 403 + 0 обработки; bot init fail → вебхук отвечает 200 с деградацией-логом (Telegram не ретраит storm'ом — урок 007 F-06).

### US2 — Durable outbox (P0 — crown jewel)

`TelegramOutbox` (Payload-коллекция): enqueue → атомарный claim 30s lease → отправка → 429 `retry_after` cooldown → приоритеты (`CRITICAL=100` GDPR-редакция, `HIGH` staff pager, `NORMAL`) → классификация ошибок (PERMANENT_NO_OP / RATE_LIMIT_429 / TRANSIENT) → starvation boost.

**Acceptance**: 1000 enqueue → p95 доставки ≤ 60 c; killed worker → lease истекает, сообщение не теряется и не дублируется (atomic claim).

### US3 — Staff pager + CAS-действия (P0)

Карточка заказа (контакты маскированы, notes-индикатор без текста, услуги/длительность/слот) + inline-кнопки approve/reject/reschedule/blacklist/fulfill; авторизация 3-уровневая (ShopSettings → env → 1:1 chat); confirm-barrier 30s на деструктив; все переходы через CAS `scheduleVersion` + FSM доменного сервиса (001/002 канон).

**Acceptance**: двойной клик approve → второй `ALREADY_PROCESSED`; неавторизованный клик → alert + 0 мутаций; reschedule → magic-link (003 канон) без мутирования времени.

### US4 — Client confirmation bot (P1)

Клиентский confirm/decline callback (bump `scheduleVersion`, cancelOn-матрица), magic-reschedule delivery, 24h cooldown анти-спам, blacklist enforcement (кнопки скрыты, 403 на попытку).

**Acceptance**: confirm до deadline блокирует auto-cancel ветку; decline → RELEASED + staff alert.

### US5 — GDPR-редакция и retention (P1)

Терминальный переход → `editMessageText` карточки с `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]`; customerTgId purge 90d (nightly канон); телефон всегда маскирован в карточке.

**Acceptance**: redaction-fail → retry через outbox CRITICAL-приоритет; purge-тест на 90d границе.

---

## 3. Edge Cases

- **Telegram webhook retry storm** при 5xx → отвечаем 200 на некритичных ошибках (урок 007 F-06), ретраи — outbox.
- **Гонка confirm-barrier**: второй клик в окне 30s → идемпотентный ответ.
- **Blacklist-клиент**: старые кнопки мертвы (editMessageReplyMarkup — очистка).
- **Bot down при деплое**: waitForBots-таймаут → вебхук 200 + отложенная обработка через inbox.
- **Мультиязычный staff** (ru/en): botStrings из ShopSettings.defaultLocale (канон легаси, без per-staff override).

## 4. Requirements

### Functional Requirements
- **FR-401 (Outbox)**: durable-очередь с lease/priority/cooldown/классификацией — единственный путь исходящих.
- **FR-402 (Staff pager)**: карточка + 5 CAS-действий + confirm-barrier + 3-уровневая авторизация.
- **FR-403 (Client bot)**: confirm/decline + reschedule-link + cooldown + blacklist.
- **FR-404 (GDPR)**: редакция на терминале, TG-ID purge 90d, маскировка PII в карточках.
- **FR-405 (Webhook security)**: secret-token timing-safe, fail-closed при отсутствующем секрете, 200-деградация.

### Non-Functional Requirements
- **NFR-401**: 72+ регрессия + ≥20 новых (outbox lease/race, CAS-матрица, auth-матрица, redaction).
- **NFR-402**: 0 новых deps сверх grammY (уже в дереве легаси? — нет: **grammY добавить** — единственное исключение из 0-deps, обоснование в плане).
- **NFR-403**: PII в логах — 0 (дени-лист канон); ≤500 MB.

## 5. Success Criteria

- **SC-001**: outbox-стресс (1000 сообщений, kill worker) — 0 потерь, 0 дублей.
- **SC-002**: CAS-матрица действий — 0 двойных применений.
- **SC-003**: auth-матрица 3 уровней × 5 действий — 0 несанкционированных мутаций.
- **SC-004**: redaction/purge — 0 PII в БД/логах после терминала+90d.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: grammY | **Да** — канон легаси, один dep с обоснованием | Танцы с raw Bot API дороже |
| Q2: Один бот или два | **Два** (staff/client) — разделение секретов и прав | Legacy канон; один бот = PR-путаница |
| Q3: WhatsApp-канал | **Нет** (Cloud API был в легаси — отложить) | Один канал за спеку; SMS/WhatsApp — после 005 |
| Q4: Подтверждение клиентом | Кнопки + fallback-ссылка | Бот может быть заблокирован — email-канон 003 остаётся |
