# Research: 003-no-show-protection

> Plan Phase 0 — Engineering Decisions (D1–D7). Grounding: 002 as-built (`c5f3bf1`) + плагин `@payloadcms/plugin-ecommerce` 3.93 (dist прочитан, L1).

## D1. Планировщик: **Payload Jobs** (Inngest отвергнут)

- **Decision**: hold-sweep (TTL 15m), reminder-job, invoice-expiry — задачи Payload Jobs (`tasks` + `schedule`; `jobs.tasks: []` уже включён в payload.config с 002). Рестарт-безопасность: job-очередь в БД, `idempotencyKey` job'а = booking id + тип задачи; lease-канон — Payload Jobs встроенно локирует задачи через БД (`ProcessingTask`), дубль-запуска при рестарте не возникает.
- **Rationale**: 0 новых deps (NFR-302 закрывает вопрос Q4 однозначно — Inngest требовал бы внешний контейнер/облако, против white-label «автономная приватная система»); DB-backed выживает рестарт; задачи в Local API-контексте → доменный сервис доступен напрямую.
- **Alternatives**: Inngest (новый dep + внешний сервис — против NFR-302 и позиционирования); node-cron (нет персистентности/lease).
- **Bench**: замер памяти при sweep-нагрузке (NFR-304) — evidence в реализации.

## D2. Webhooks: **штатный endpoint плагина + проп `webhooks`** (свой роут не строим)

- **Decision**: хендлеры передаются в `stripeAdapter({ webhooks: { 'checkout.session.completed': handler, 'payment_intent.payment_failed': handler, 'payment_intent.succeeded': handler, 'charge.refunded': handler } })` в `src/plugins/index.ts`. Плагин уже делает: SDK `constructEvent` (400 на tamper), роутинг по event.type, 200-JSON. Наши хендлеры: (1) inbox-dedupe `InboxEvent` (уникальный `provider+providerRef`; P2002/dup → 200 no-op), (2) fulfillment через `assertProviderAmountMatch` + FSM через доменный сервис, (3) любой сбой обработки → throw → Next возвращает 5xx → Stripe ретраит → идемпотентная до-обработка.
- **Rationale**: ACK-матрица из spec US2 полностью ложится на плагин; подпись-верификация не дублируется; 001-пробел «хендлеров нет» закрывается в живом пути плагина, а не параллельным маршрутом.
- **Alternatives**: собственный `/api/payments/stripe/webhooks` (дубль верификации, риск расхождения с плагином).

## D3. Email: **Resend REST через fetch, 0 deps**

- **Decision**: `src/lib/email/resendAdapter.ts` — чистый `fetch` на `https://api.resend.com/emails`, `RESEND_API_KEY` env (fail-closed: пустой ключ при вкл. reminders → бут прерывается диагностикой, канон 001 F-03). Отправка — только из Payload Job'ов (retry ≤5, backoff — встроенный). Delivery-log: `EmailDeliveryLog` коллекция (bookingId, kind: confirmation|reminder|cancel, status, salted-hash получателя — PII-канон INV-010).
- **Rationale**: nodemailer-адаптер в шаблоне закомментирован; SMTP-инфраструктура не нужна; Resend REST = 1 POST, зависимости не нужны.
- **Alternatives**: nodemailer+SMTP (инфраструктура на VPS заказчика, отдельная точка отказа), @resend/sdk (лишний dep).

## D4. PREPAID-поток: PaymentIntent в bookingService (расширение 002-сервиса)

- **Decision**: `bookingService.createBooking` ветвится по `product.paymentMode`: NONE — путь 002 без изменений; FULL_PREPAYMENT — (1) email обязателен (FR-308, 422 иначе), (2) atomic create `SlotReservation(HELD, holdExpiresAt=now+15m)` + `Order(status='processing', amount=priceInUSD×100 minor units, currency='USD')` + `AuditEvent` — всё внутри drizzle-транзакции с advisory lock (канон 002), (3) **после коммита** — Stripe `paymentIntent.create` (amountMinor через `assertValidInvoiceAmount`, `metadata.bookingId`), `paymentIntentID` в stripe-группу Order (поля плагина), (4) клиент подтверждает платёж Stripe.js на /book (канон шаблонного CheckoutPage), (5) webhook `payment_intent.succeeded` → FSM `PAYMENT_PENDING→CONFIRMED`. Ошибка создания PI → Order/SlotReservation остаются в HELD, клиенту 502 `PAYMENT_INIT_FAILED`, sweep освободит слот через 15m (Edge Case spec).
- **Rationale**: domain service остаётся единственным статус-писателем; PI после коммита исключает orphan-payment без брони (легаси-канон); шаблонный checkout-компонент переиспользуется.
- **Alternatives**: переиспользование плагинного `initiatePayment` (ожидает корзинную форму Order с items — несовместимо с booking-Order без адаптера); Checkout Session hosted (проще UI, но ломает «PaymentIntent»-канон спеки и legacy FSM-события).

## D5. Refund: Stripe Refund API + refund-request как статус-машина Order

- **Decision**: отмена до cutoff (FR-304) → `stripe.refunds.create({ payment_intent })` в cancel-флоу (после FSM `CUSTOMER_CANCEL`; сбой refund → Order `REFUND_FAILED` + staff alert, деньги не теряются — верифицируемый хвост). После cutoff → `refund_requested` статус Order + App-API staff (OWNER/OPERATOR) approve/reject; SLA 24h мониторится AuditEvent-временем (авто-эскалации нет — канон «NO AUTO-REFUND AUTOMATION»).
- **Rationale**: webhook `charge.refunded` закрывает петлю (REFUNDED-статус Order) без polling.

## D6. Cancel/Reschedule-токены: HMAC + nonce-hash, one-time

- **Decision**: cancel-токен 002 (page-link) дополняется email-доставкой; reschedule-токен — `rescheduleTokenHash` (nullable) на SlotReservation, HMAC(secret, nonce) с TTL до startTime; consume = атомарный `UPDATE ... SET reschedule_token_hash = NULL WHERE id = ? AND reschedule_token_hash = $hash` (одноразовость на уровне SQL); после consume → редирект `/book?reschedule=<nonce>` с prefilled услугой. Cutoff per-item default 3h из продукта.
- **Rationale**: replay → `TOKEN_ALREADY_CONSUMED` (строка уже NULL); bump scheduleVersion сохраняет CAS-канон.

## D7. Reminder CAS: условный UPDATE в транзакции job'а

- **Decision**: `reminderSentAt` (nullable date) на SlotReservation; reminder-job: `UPDATE slot_reservations SET reminder_sent_at = now() WHERE id = $1 AND reminder_sent_at IS NULL AND status = 'BOOKED'` (drizzle returning) → строка обновилась → отправка; не обновилась → воркер-соперник уже отправил (CAS-канон легаси). Ошибка Resend → откат флага (транзакция job'а) → ретрай Payload Jobs.
- **Rationale**: строго одна отправка на гонке двух воркеров доказуема тестом; ACK клиента (bump scheduleVersion) — уже канон CAS.
