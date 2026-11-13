# Спецификация: 012-deposit-telegram

**Input**: Voice of Pain #1 (no-shows → deposits, 9 threads), бизнес-план v20.3 (Product 2 Sprint B), FR-BK (011 multitenant design, telegram wiring deferred from 004)
**Organization**: Phase 1 deposit flow (P0) → Phase 2 telegram wiring (P1) → closeout.

## 1. Via Negativa (Strict Taboos)

- ❌ **NO FSM CHANGES:** DEPOSIT reuses PREPAID track (HELD → payment → BOOKED). Меняется amount PaymentIntent, не track.
- ❌ **NO NEW DEPS:** `@stripe/react-stripe-js`, `@stripe/stripe-js`, `stripe` уже установлены. Ноль новых пакетов.
- ❌ **NO FULL_PREPAYMENT BREAK:** существующий FULL_PREPAYMENT flow не модифицируется — DEPOSIT добавляется параллельно.
- ❌ **NO GROUP-SIZE DEPOSITS:** разный депозит по размеру группы — Phase 2 (требует booking history).

## 2. Phase 1: Deposit flow (US1 — P0)

### FR-1201: Product field `deposit_amount`
- Product collection: field `deposit_amount` (number, USD, optional, default null)
- Если `deposit_amount` > 0 и `paymentMode` не задан → `paymentMode = 'DEPOSIT'`
- Если `paymentMode = 'FULL_PREPAYMENT'` → deposit_amount игнорируется (full price)
- Валидация: deposit_amount > 0, deposit_amount ≤ priceInUSD

### FR-1202: createBooking DEPOSIT mode
- `PaymentMode = 'DEPOSIT' | 'NONE' | 'FULL_PREPAYMENT'`
- createBooking: если DEPOSIT → PaymentIntent amount = deposit_amount × 100 (minor units)
- FSM: PREPAID track (HELD → payment confirmed → BOOKED) — канон 003
- Response: `clientSecret` + `paymentIntentId` возвращаются как для FULL_PREPAYMENT

### FR-1203: DepositPayment component на confirmation page
- Confirmation page: если `paymentMode = DEPOSIT` и `paymentIntentId` != null → показать `<DepositPayment>`
- DepositPayment: Stripe Payment Element (`@stripe/react-stripe-js` loadStripe + Elements provider)
- Props: clientSecret, publishableKey
- On payment success: polling `/api/booking/[id]/status` → WAITING for webhook → BOOKED → показать «Депозит получен»
- On payment failure: показ ошибки + retry кнопка

### FR-1204: Deposit refund через 003 cutoff canon
- refundService: refund amount = deposit_amount (не full price)
- cancelBooking: если DEPOSIT → refund deposit_amount при cutoff
- staff-refund: approve → refund deposit_amount

### FR-1205: Confirmation page update
- Booking confirmed → если DEPOSIT + не оплачен → показать DepositPayment + текст «Внесите депозит для подтверждения брони»
- Статус HELD/PAYMENT_PENDING → BOOKED после webhook
- Если уже оплачен → обычный confirmation (без DepositPayment)

## 3. Phase 2: Telegram wiring (US2 — P1)

### FR-1211: Staff bot token wiring
- env: `TELEGRAM_STAFF_BOT_TOKEN` + `TELEGRAM_STAFF_WEBHOOK_SECRET`
- botManager: init staff bot из token
- webhook URL: `POST /api/telegram/staff/webhook` (уже реализовано)

### FR-1212: Client bot token wiring
- env: `TELEGRAM_CLIENT_BOT_TOKEN` + `TELEGRAM_CLIENT_WEBHOOK_SECRET`
- webhook URL: `POST /api/telegram/client/webhook` (уже реализовано)

### FR-1213: Card on booking (demo-ready)
- `enqueueStaffCard` вызывается в createBooking (уже реализовано, канон 004)
- При деплое с настроенными токенами — карточка приходит в staff chat автоматически

## 4. Non-Functional Requirements

- **NFR-1201:** 197+ существующих тестов зелёные (deposit flow additive)
- **NFR-1202:** 0 новых deps
- **NFR-1203:** Deposit PaymentIntent создаётся после booking commit (не до)
- **NFR-1204:** DepositPayment component p95 < 3s (Stripe Elements lazy load)

## 5. Success Criteria

- **SC-001:** Product с deposit_amount > 0 → createBooking → 201 + clientSecret → DepositPayment на confirmation → оплата → webhook → BOOKED
- **SC-002:** Product без deposit_amount → NONE → 201 без PaymentIntent → confirmation без DepositPayment
- **SC-003:** Product с FULL_PREPAYMENT → 201 + clientSecret на full price (не сломался)
- **SC-004:** Отмена до cutoff → refund deposit_amount
- **SC-005:** Telegram bot отправляет карточку при брони (после настройки token)

## 6. Files

```
src/collections/Products/index.ts           # MOD: deposit_amount field
src/lib/booking/bookingService.ts           # MOD: PaymentMode 'DEPOSIT', createBooking deposit logic
src/lib/booking/refundService.ts            # MOD: refund deposit_amount (не full price)
src/components/booking/DepositPayment.tsx   # NEW: Stripe Payment Element
src/app/[locale]/book/confirmation/[id]/page.tsx  # MOD: conditional DepositPayment
src/i18n/locales/ru.json                    # MOD: deposit strings
src/i18n/locales/en.json                    # MOD: deposit strings
tests/int/deposit-flow.int.spec.ts          # NEW: deposit matrix
.env.example                                # MOD: telegram tokens
```

## Clarifications

### Session 2026-11-13
- Q: Интеграция с машиной состояний (FSM) → A: Режим DEPOSIT повторно использует трек PREPAID (HELD → webhook подтверждения оплаты → BOOKED); новых статусов в FSM не вводится.
- Q: Политика возврата депозита при отмене → A: Возврат суммы deposit_amount при отмене до дедлайна (cutoff); после cutoff депозит удерживается бизнесом.
- Q: Именование переменных окружения для Telegram-ботов → A: Поддержка `TELEGRAM_STAFF_BOT_TOKEN` и `TELEGRAM_CLIENT_BOT_TOKEN` с сохранением обратной совместимости для `TELEGRAM_BOT_TOKEN`.
- Q: Порядок создания PaymentIntent в Stripe → A: PaymentIntent на сумму депозита создаётся строго ПОСЛЕ фиксации записи брони в БД со статусом HELD.

