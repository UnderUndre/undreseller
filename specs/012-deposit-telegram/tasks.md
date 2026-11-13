# Tasks: 012 (deposit-telegram)

**Input**: spec rev 1.0, plan.md, requirements-audit PASS run #1
**Organization**: Phase 1 схема данных → Phase 2 денежный путь и FSM → Phase 3 UI подтверждения → Phase 4 Telegram боты → Phase 5 тесты и closeout.

## Phase 1: Schema & Data Model

- [X] T1210 [DB] `src/collections/Products/index.ts` — добавление поля `depositAmount` (number, USD, min: 0, admin description).
- [X] T1211 [DB] `src/migrations/20261113_000001_deposit_payment_mode.ts` — миграция: добавление колонки `deposit_amount` в таблицу `products`, добавление значения `'DEPOSIT'` в enum `enum_orders_payment_mode`. Регистрация в `src/migrations/index.ts`.

## Phase 2: Booking & Refund Services (Risk 15)

- [X] T1220 [BE] `src/lib/booking/bookingService.ts` — поддержка режима `PaymentMode = 'DEPOSIT'`. Определение суммы `PaymentIntent` как `deposit_amount * 100` центов. Сохранение `paymentIntentId` и возврат `clientSecret`.
- [X] T1221 [BE] `src/lib/booking/refundService.ts` — возврат ровно `deposit_amount` (вместо полной стоимости услуги) при отмене брони с `paymentMode = DEPOSIT` до наступления cutoff.
- [X] T1222 [BE] `src/lib/payments/stripeGateway.ts` — поддержка передачи суммы депозита в создание PaymentIntent.

## Phase 3: Confirmation UI & i18n

- [X] T1230 [FE] `src/components/booking/DepositPayment.tsx` — новый клиентский компонент: Stripe Elements (`loadStripe`, `PaymentElement`), поллинг статуса `/api/booking/[id]/status` до перехода в `BOOKED`, обработка ошибок и повтор.
- [X] T1231 [FE] `src/app/[locale]/book/confirmation/[id]/page.tsx` — условный рендер `<DepositPayment>` если статус `HELD` и режим `DEPOSIT`, баннер о необходимости внесения депозита.
- [X] T1232 [I18N] `src/i18n/locales/ru.json` и `src/i18n/locales/en.json` — ключи `depositRequired`, `depositAmount`, `payDeposit`, `depositReceived`.

## Phase 4: Telegram Wiring

- [X] T1240 [BOT] `src/lib/telegram/botManager.ts` — поддержка `TELEGRAM_STAFF_BOT_TOKEN`, `TELEGRAM_CLIENT_BOT_TOKEN` с сохранением обратной совместимости для `TELEGRAM_BOT_TOKEN`.
- [X] T1241 [ENV] `.env.example` — документирование новых переменных ботов.

## Phase 5: Verification & Closeout

- [X] T1250 [QA] `tests/int/deposit-flow.int.spec.ts` — 5 сквозных сценариев (SC-001..SC-005):
  1. Product с deposit → 201 + clientSecret на сумму депозита.
  2. Product без deposit → NONE → 201 без PaymentIntent.
  3. Product с FULL_PREPAYMENT → 201 + clientSecret на полную сумму.
  4. Отмена до cutoff → refund суммы депозита.
  5. Отмена после cutoff → удержание депозита (без возврата).
  Итог: 5/5 PASS, 202/202 интеграционных тестов в репозитории зелёные.
