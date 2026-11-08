# Test Cases: 004-telegram-bots (ISO/IEC/IEEE 29119-3)

**Всего TC**: 22 · Профиль: EP + BVA + STM + DT + Error Guessing · Telegram-транспорт — fake fetch (0 сети)

## US2/FR-401/408: Outbox + dispatch

### TC-004-001: claim-race двух воркеров на одном батче → 0 дублей (CTE SKIP LOCKED, STM)
- **Priority**: P0 · **Technique**: STM (Risk 16)
- Проверка: PostgreSQL CTE `WITH batch AS (...) UPDATE telegram_outbox ... FROM batch RETURNING ...` исключает ошибку 0A000 и гарантирует ровно один claim на каждое сообщение.

### TC-004-002: kill worker при lease → lease истекает → сообщение доставлено ровно один раз (0 потерь)
- **Priority**: P0 · **Error Guessing**

### TC-004-003: 429 с retry_after → cooldown (availableAt), доставка после истечения; сообщение не потеряно
- **Priority**: P0 · **Error Guessing**

### TC-004-004: приоритеты — CRITICAL обгоняет NORMAL; starvation boost: NORMAL > 5 мин → обгоняет свежий HIGH; burst 100 → drain без потерь; steady p95 ≤ 60 c @ ≤50 msg/min (замер)
- **Priority**: P0 · **STM + Performance**
- Проверка: частичный индекс `WHERE status = 'queued'` удерживает время выборки < 1 мс.

### TC-004-005: классификация ошибок — PERMANENT (chat not found) → dead без ретраев + staff alert (AuditEvent `telegram.outbox-dead`); TRANSIENT ×5 → dead
- **Priority**: P1 · **DT**

## US3/FR-402: Staff pager + CAS

### TC-004-006: карточка — телефон маскирован, notes-индикатор без текста, слот в TZ инстанса, авто-постановка при createBooking
- **Priority**: P0 · **EP**

### TC-004-007: двойной клик approve → второй ALREADY_PROCESSED (CAS scheduleVersion, гонка ×2)
- **Priority**: P0 · **STM** (Risk 16)

### TC-004-008: auth-матрица 3 уровня × 5 действий — L1/L2/L3 + 0 несанкционированных мутаций (DT, SC-003); защита ShopSettings.staffChatIds через adminOnlyFieldAccess (403/hidden на публичном REST)
- **Priority**: P0 · **DT + Security**

### TC-004-009: 2-шаговый confirm-barrier на деструктив (reject/blacklist)
- **Priority**: P0 · **STM + BVA**
- 1-й клик: действие НЕ выполняется, возвращается `REQUIRES_CONFIRMATION` + alert оператору;
- 2-й клик в 30s окне: возвращается `CONFIRMED`, действие исполняется через CAS;
- 2-й клик после 30s: таймаут, действие не выполняется, барьер взводится заново;
- Недеструктивные действия (`approve`, `complete`, `reschedule`) исполняются сразу без барьера.

### TC-004-020: webhook security — неверный secret → 403 + 0 обработки; отсутствие секрета → fail-closed 403; bot-init fail → 200 + деградация-лог
- **Priority**: P0 · **Security DT**

## US4/FR-403/407: Client bot + linking

### TC-004-010: `/start <accessToken>` валидный → TgLink создан; повторные брони того же клиента → составной ключ `UNIQUE (chat_id, order_id)` сохраняет обе связи без перезаписи
- **Priority**: P0 · **EP**

### TC-004-011: невалидный/чужой accessToken → отказ без создания TgLink
- **Priority**: P0 · **Negative**

### TC-004-012: клиентские callbacks — confirm → acknowledgeBooking (CAS bump); decline → cancelBookingByClientChat (FSM RELEASED, соблюдение политики возвратов 003 до/после cutoff, staff alert outbox HIGH); cooldown 24h
- **Priority**: P0 · **STM + BVA**

## FR-406: Blacklist

### TC-004-013: blacklist-клиент (по chatId или phone): callbacks → 403 + 0 мутаций; кнопки не рендерятся; старая клавиатура очищена (outbox editMessageReplyMarkup)
- **Priority**: P0 · **DT** (SC-003)

### TC-004-014: staff blacklist через confirm-barrier; поддержка блокировки клиентов без Telegram (по номеру phone); повторный blacklist → идемпотентно
- **Priority**: P1 · **DT**

## FR-407/D7: Reschedule delivery

### TC-004-015: staff reschedule → issueRescheduleToken → новый токен валиден, старый мёртв; CAS bump + audit
- **Priority**: P0

### TC-004-016: deep-link delivery через outbox NORMAL; fallback при отсутствии TgLink у клиента → ссылка возвращается в alert оператора и дублируется на email
- **Priority**: P1

## US5/FR-404: GDPR

### TC-004-017: терминальный переход → адресная редакция карточек через editMessageText по сохранённому sentMessageId (CRITICAL обгоняет очередь); fail → retry
- **Priority**: P0 · **STM**

### TC-004-018: purge BVA — TgLink при 89 дней → жив; 90 → удаляется; 91 → удаляется (±1 день)
- **Priority**: P0 · **BVA**

### TC-004-019: PII-дени-лист — в логах/outbox-метаданных нет телефонов/имён (chatId только в TgLink/Blacklist/meta до purge)
- **Priority**: P0 · **Error Guessing**

## NFR

### TC-004-021: полный регрессионный гейт (validate/lint/int/build 0 exit; 129+ старых зелёные)
### TC-004-022: ровно 1 новый dep (diff package.json = grammy); ≤500 MB замер при dispatch (evidence)

## Exploratory Charter (Risk 15–19, конституция XII)
- **Чартер E-02** (FR-401/408, 60 мин): свободная атака на outbox — гонки CTE claim × dispatch × enqueue, 429-штормы, kill в момент отправки, starvation-инверсии.
