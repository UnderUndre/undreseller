# 📋 СПЕЦИФИКАЦИЯ (FEATURE SPEC)

**Slug:** `003-no-show-protection`
**Репозиторий:** `UnderUndre/undreseller` · **База:** 001 (`980bc32`) + 002-booking-domain as-built (`c5f3bf1`)
**Статус:** **DRAFT — REVISION 1.1 (2026-11-07; clarify: C1 webhook ACK-матрица, FR-308 email-политика, словарь acknowledgement; ревизия по requirements-audit run #1)**
**Source of truth по бизнесу:** план v2.5.0 §2.2 (холд/оплата — часть сквозного процесса) · **prior research:** legacy 004 research (deposit-решение владельца FR-407), competitors-research.md
**Grounding (002 as-built):** FSM PREPAID-трек в kernel (`bookingFsm.ts`), `invariants.ts` в репо, Payload Jobs framework включён (`jobs.tasks: []`), плагин монтирует `/api/payments/stripe/webhooks` (SDK-верификация есть, хендлеров нет), `customerEmail` на Order — nullable

---

## 1. Контекст, Обоснование и Границы

### 1.1. Проблема

No-Show 10–25% без защит — прямая кассовая дыра ICP ($1,500–4,000/мес по плану v2.5.0). Рынок лечит это депозитами (−55–65%) и reminders (−29–39%). В 001: Stripe-рельсы стоят, FSM PREPAID-трек готов и загейчен, инварианты сумм портированы — не хватает соединительной ткани: серверные webhook'и, депозит-политика, reminders, самоотмена.

### 1.2. Решение

Оживить **PREPAID track FSM** (Stripe-only): депозит-политика per-service + PaymentIntent при бронировании + серверные webhooks + идемпотентный fulfillment через `invariants.ts`; email-reminders (Resend-канон) с CAS; клиентская самоотмена/перенос через HMAC-токены (crown jewel #3).

### 1.3. Границы и Via Negativa (Strict Taboos)

* ❌ **NO SMS-CHANNEL:** email-first; SMS (Twilio/провайдер) — отдельное решение+бюджет (Clarification Q2).
* ❌ **NO PARTIAL/PERCENT DEPOSITS:** только `none` (default) | `full prepayment` per-service — legacy FR-407 канон владельца; проценты/пакеты — отвергнутый 003.2-хвост.
* ❌ **NO BOTS:** Telegram — 004.
* ❌ **NO AUTO-REFUND AUTOMATION:** refund-request черезstaff SLA (канон 24h), ручное разрешение.
* ❌ **NO CARD-ON-FILE по дефолту:** SetupIntent-режим — Clarification Q3 (рынок Booksy/Square так делает, но это off-session-сложность).

### 1.4. Бизнес-план hook

Ядро процесса §2.2 («холд/оплата») — дельта VII-B.2 по платёжным рельсам уже учтена в v2.5.0 (Stripe из коробки); waiver VII-B.5 при plan.

---

## 2. User Stories (Prioritized)

### US1 — Депозит-политика и PREPAID-бронирование (P0 — money path)

Per-service переключатель `paymentMode: NONE | FULL_PREPAYMENT` (default NONE — конверсия-first, канон владельца). FULL_PREPAYMENT: бронь создаёт Stripe PaymentIntent (amountMinor из инварианта-модуля) → клиент платит на hosted-этапе → FSM `AVAILABLE → HELD (TTL 15m) → PAYMENT_PENDING → CONFIRMED`; истечение холда → release (lease sweep); вебхук-подтверждение → fulfillment.

**Acceptance Scenarios**:
1. NONE-услуга — путь 002 без изменений (0 регрессий).
2. FULL_PREPAYMENT: успешная оплата → CONFIRMED (BOOKED); неоплаченный холд через 15 мин → RELEASED + отмена Order.
3. Поздний вебхук после release + re-book → `PAID_REQUIRES_RESOLUTION` + refund-request (канон FR-432), никогда тихое PAID.
4. Replay ×100 одного события → один PaymentEvent (идемпотентность `@@unique(provider, providerRef)`).

### US2 — Серверные Stripe webhooks (P0 — закрытие 001-пробела)

Хендлеры регистрируются в **штатный** endpoint плагина `/api/payments/stripe/webhooks` (SDK-верификация подписи и 400-on-tamper уже в плагине) через проп `webhooks` адаптера: `checkout.session.completed` / `payment_intent.*` → inbox-dedupe (`InboxEvent` канон: replay/неизвестный тип → 200 no-op) → fulfillment через `assertProviderAmountMatch` (001 invariants) → FSM-событие через доменный сервис. **ACK-матрица**: 200 — дубликат/неизвестный тип/успех; 5xx — сбой обработки (Stripe ретраит по своему расписанию); 400 — tamper (плагин). Никогда не ACK-аем необработанное.

**Acceptance Scenarios**: tampered signature → 400, 0 обработок; duplicate eventId → dedupe no-op 200; amount mismatch → `AMOUNT_MISMATCH`-ветка (инвариант уже в репо); сбой БД при обработке → 5xx → Stripe ретрай → идемпотентная до-обработка.

### US3 — Email reminders (P0 — −29–39% no-show)

Порт канона Resend-адаптера: reminder-job (за `confirmationNoticeHours` до слота, default 24h) → клиентский **acknowledgement** (кнопка/ссылка — bump scheduleVersion; не путать с FSM `CONFIRMED`) → delivery-log с salted-hash (PII-канон). CAS `reminderSentAt` — строго одна отправка. Reminders уходят только броням с известным `customerEmail` (политика FR-308).

**Acceptance Scenarios**:
1. Напоминание уходит ровно один раз (CAS-тест на race двух воркеров).
2. Клиент подтвердил → статус подтверждён; никакой авто-отмены без настройки (auto-cancel — off по умолчанию, legacy канон).

### US4 — Самоотмена и перенос клиентом (P0 — crown jewel #3)

HMAC cancel-token (одноразовый, TTL, hash в БД) в письме-подтверждении; отмена до `cancellationCutoffHours` (per-item, default 3h) → RELEASED + возврат по политике (REFUND_REQUESTED, SLA 24h staff); перенос → magic-reschedule link (одноразовый, nonce-hash, bump scheduleVersion) → /book с сохранённой корзиной.

**Acceptance Scenarios**:
1. Отмена после cutoff → отказ с политикой (деньги не возвращаются автоматом — staff resolution).
2. Replay cancel-token → `TOKEN_ALREADY_CONSUMED`; reschedule-токен инвалидируется при новом переносе.

### US5 — Планировщик (P0 — решение D из 002 переносится сюда)

Холд-sweep, reminder-job, invoice-expiry: выбор between Inngest (канон легаси) vs Payload Jobs (0 новых deps) — **обязательное решение plan-фазы** с бенчем на ≤500 MB.

**Acceptance Scenarios**: sweep не пропускает expired-hold при рестарте воркера (idempotent, lease-канон).

---

## 3. Edge Cases

- **Поздний вебхук** после истечения холда: slot free → re-confirm atomic; slot re-booked → `PAID_REQUIRES_RESOLUTION` + refund-request (легаси FSM-тесты уже это покрывают).
- **Недоплата/переплата**: инвариант 001 отфильтрует (mismatch → operator-resolution).
- **Отмена в окне cutoff ±1 минута** (BVA): cutoff по `startTime - cancellationCutoffHours`, граница — inclusive/exclusive зафиксировать в плане.
- **Reminder при отменённой брони**: cancel до reminder → reminder не уходит (cancelOn-матрица).
- **Stripe retry storm**: dedupe по eventId + P2002 — 200 на дубли; сбой БД → 5xx → ретрай → до-обработка (идемпотентно).
- **PaymentIntent creation failure** (Stripe 5xx/timeout при старте оплаты): бронь остаётся в HELD, клиенту 502 с каталог-кодом; холд истекает штатным sweep'ом (TTL 15m) → RELEASED.
- **Resend недоступен**: job ретраится встроенным механизмом Payload Jobs (backoff, ≤5 попыток); после исчерпания — delivery-log с ошибкой, алерт в AuditEvent (повторная отправка не дублируется благодаря CAS `reminderSentAt`).
- **Бронь без email**: NONE-бронь без email — без reminders/писем; cancel — on-page ссылкой; FULL_PREPAYMENT без email невозможен (FR-308, 422).
- **Часовые пояса**: cutoff и reminders в TZ инстанса (канон 002 US3).

## 4. Requirements

### Functional Requirements
- **FR-301 (Deposit policy)**: `paymentMode: NONE | FULL_PREPAYMENT` per-service; NONE — дефолт инстанса.
- **FR-302 (PREPAID FSM)**: `AVAILABLE→HELD→PAYMENT_PENDING→CONFIRMED/UNDERPAID` через доменный сервис; TTL 15m sweep; late-payment → `PAID_REQUIRES_RESOLUTION`.
- **FR-303 (Stripe webhooks)**: хендлеры в штатном endpoint плагина (проп `webhooks`); inbox-dedupe; ACK-матрица 200/5xx/400; `PaymentEvent` ledger + `invariants.ts` в живом пути; сбой обработки → 5xx → идемпотентный ретрай Stripe.
- **FR-304 (Refund policy)**: refund-request SLA 24h; отмена до cutoff → авто-возврат Stripe (Refund API); после — staff resolution.
- **FR-305 (Email reminders)**: Resend-адаптер (HTTP, 0 deps), CAS-отправка, delivery-log (salted hash), confirmation-письмо с cancel/reschedule-токенами; retry-политика недоставки — встроенные ретраи Payload Jobs (экспоненциальный backoff, ≤5 попыток).
- **FR-306 (Cancel/Reschedule tokens)**: HMAC, одноразовость, nonce-hash, cutoff per-item (default 3h), scheduleVersion bump.
- **FR-307 (Scheduler)**: единый планировщик sweeps/jobs — решение plan-фазы (Inngest vs Payload Jobs), idempotent + lease-канон.
- **FR-308 (Email capture policy)**: `customerEmail` **обязателен** при бронировании услуги `FULL_PREPAYMENT` (422 без него); для `NONE` — опционален; reminders/cancel-reschedule-письма — только броням с email; email-less брони самообслуживаются on-page cancel-ссылкой (002-канон), reschedule им недоступен (повторное бронирование вручную).

### Non-Functional Requirements
- **NFR-301 (Regression)**: 72+ теста 001/002 зелёные; новые ≥25 (webhooks ×100 replay, FSM PREPAID-матрица, CAS reminders, token BVA, cutoff BVA).
- **NFR-302 (No new deps)**: stripe SDK уже в дереве; Resend — HTTP-адаптер (0 deps); всё остальное — запрет (кроме решения Q2 SMS).
- **NFR-303 (Fail-closed money path)**: 0 silent-PAID; mismatch → operator-alert; webhook fail-open запрещён.
- **NFR-304 (Memory)**: ≤500 MB при sweep-нагрузке (fencing-инвариант).

## 5. Success Criteria

- **SC-001**: PREPAID-матрица FSM (hold→pay→confirm / expire / late-payment) — 100% переходов покрыто тестами.
- **SC-002**: webhook replay ×100 → ровно 1 PaymentEvent; tampered signature → 400.
- **SC-003**: reminder CAS — 0 двойных отправок на гонке.
- **SC-004**: cancel/reschedule token-матрица (valid/expired/replayed/after-cutoff) зелёная.
- **SC-005**: 72+ регрессия зелёная; полный гейт 0 exit.
- **SC-006**: email-матрица FR-308 (PREPAID без email → 422; NONE без email → booking OK, 0 писем; с email → 1 confirmation + 1 reminder) зелёная.

## 6. Зафиксированные Решения (Clarifications — дефолты ветируемы)

| Вопрос | Решение | Обоснование |
| :--- | :--- | :--- |
| Q1: Депозит-модель | `NONE` (default) \| `FULL_PREPAYMENT`; card-on-file (SetupIntent) — опция Q3 | Legacy FR-407 канон: конверсия-first, без процентных депозитов |
| Q2: SMS-канал | **Нет в 003** (email-first); SMS — отдельное решение с бюджетом | Провайдер+стоимость; email уже в каноне |
| Q3: Card-on-file | Открыт (рынок Booksy/Square так делает; off-session-сложность) | Решается на plan с оценкой |
| Q4: Планировщик | Inngest vs Payload Jobs — план-фаза, бенч ≤500 MB | Наследует Q3 из 002 |
| Q5: Underpaid-ветка | Канон легаси (UNDERPAID + staff alert) без авто-подтверждения | Money-path fail-closed |
| Q6: Email-политика | Email обязателен для FULL_PREPAYMENT; опционален для NONE; reminders только при email | Аудит run#1 B1: 002 собирает имя/телефон, email nullable; канон 007 fail-closed для money-писем |
