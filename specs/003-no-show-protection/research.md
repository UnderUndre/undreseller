# Research: 003-no-show-protection

> Plan Phase 0 — Engineering Decisions (D1–D7). Grounding: 002 as-built (`c5f3bf1`) + плагин `@payloadcms/plugin-ecommerce` 3.93 (dist прочитан, L1).

## D1. Планировщик: **Payload Jobs** (Inngest отвергнут)

- **Decision**: hold-sweep (TTL 15m), reminder-job, invoice-expiry — задачи Payload Jobs (`tasks` + `schedule` + `autoRun`). **Критический инвариант рантайма Payload 3.93**: объявление `tasks: [...]` недостаточно — требуется обязательная регистрация `jobs.autoRun: [{ cron: '* * * * *', queue: 'default' }]` в `src/payload.config.ts`, иначе фоновый воркер не запускается и джобы не читаются из БД. Задачи конфигурируются с опцией `schedule: [{ cron: '*/1 * * * *', queue: 'default' }]` (для hold-sweep) и `*/5 * * * *` (для reminder-sweep). Рестарт-безопасность: job-очередь в БД (`payload_jobs`), `idempotencyKey` job'а = booking id + тип задачи; lease-канон — Payload Jobs встроенно локирует задачи через БД (`ProcessingTask`), дубль-запуска при рестарте не возникает.
- **Rationale**: 0 новых deps (NFR-302 закрывает вопрос Q4 однозначно — Inngest требовал бы внешний контейнер/облако, против white-label «автономная приватная система»); DB-backed выживает рестарт; задачи в Local API-контексте → доменный сервис доступен напрямую.
- **Alternatives**: Inngest (новый dep + внешний сервис — против NFR-302 и позиционирования); node-cron (нет персистентности/lease).
- **Bench**: замер памяти при sweep-нагрузке (NFR-304) — evidence в реализации.

## D2. Webhooks: **штатный endpoint плагина + проп `webhooks`** (свой роут не строим)

- **Decision**: хендлеры передаются в `stripeAdapter({ webhooks: { 'checkout.session.completed': handler, 'payment_intent.payment_failed': handler, 'payment_intent.succeeded': handler, 'charge.refunded': handler } })` в `src/plugins/index.ts`. Плагин уже делает: SDK `constructEvent` (400 на tamper), роутинг по event.type, 200-JSON. Наши хендлеры: (1) inbox-dedupe `InboxEvent` (уникальный `provider+providerRef`; ловим Postgres-ошибку уникальности `23505` — legacy Prisma-код P2002 устранён → 200 no-op), (2) fulfillment через `assertProviderAmountMatch` + FSM через доменный сервис, (3) любой сбой обработки → throw → Next возвращает 5xx → Stripe ретраит → идемпотентная до-обработка.
- **Rationale**: ACK-матрица из spec US2 полностью ложится на плагин; подпись-верификация не дублируется; 001-пробел «хендлеров нет» закрывается в живом пути плагина, а не параллельным маршрутом.
- **Alternatives**: собственный `/api/payments/stripe/webhooks` (дубль верификации, риск расхождения с плагином).

## D3. Email: **Resend REST через fetch, 0 deps**

- **Decision**: `src/lib/email/resendAdapter.ts` — чистый `fetch` на `https://api.resend.com/emails`, `RESEND_API_KEY` env. Для исключения сбоев тестов и сборки `next build` валидация ключа выполняется **лениво** (fail-closed при фактической попытке отправки в prod/staging, в тестах — mock). Адрес отправителя конфигурируется через `RESEND_FROM_EMAIL` (с fallback на `ShopSettings.fromEmail` или `booking@undreseller.local`). Отправка — только из Payload Job'ов (retry ≤5, backoff — встроенный). Delivery-log: `EmailDeliveryLog` коллекция (bookingId, kind: confirmation|reminder|cancel, status, salted-hash получателя — PII-канон INV-010). Коллекция регистрируется в `payload.config.ts`.
- **Rationale**: nodemailer-адаптер в шаблоне закомментирован; SMTP-инфраструктура не нужна; Resend REST = 1 POST, зависимости не нужны.
- **Alternatives**: nodemailer+SMTP (инфраструктура на VPS заказчика, отдельная точка отказа), @resend/sdk (лишний dep).

## D4. PREPAID-поток: PaymentIntent в bookingService (расширение 002-сервиса)

- **Decision**: `bookingService.createBooking` проверяет `paymentMode` **исключительно на сервере** из `product.paymentMode`: клиентский ввод не принимается (защита от подделки). NONE — путь 002 без изменений; FULL_PREPAYMENT — (1) email обязателен (FR-308, 422 иначе), (2) atomic create `SlotReservation(HELD, holdExpiresAt=now+15m)` + `Order(status='processing', amount=Math.round(priceInUSD×100) minor units, currency='USD')` + `AuditEvent` — всё внутри drizzle-транзакции с advisory lock (канон 002), (3) **после коммита** — Stripe `paymentIntent.create` (amountMinor через `assertValidInvoiceAmount`, `metadata.bookingId`), `paymentIntentID` в stripe-группу Order (поля плагина), (4) клиент подтверждает платёж Stripe.js на /book (канон шаблонного CheckoutPage), (5) webhook `payment_intent.succeeded` → FSM `HELD/PAYMENT_PENDING→CONFIRMED`. При сбое создания PI бронь не маринуется 15 минут, а немедленно переводится в `RELEASED`, клиенту возвращается 502 `PAYMENT_INIT_FAILED`.
- **Rationale**: domain service остаётся единственным статус-писателем; PI после коммита исключает orphan-payment без брони (легаси-канон); серверная проверка paymentMode закрывает вектор взлома.
- **Alternatives**: переиспользование плагинного `initiatePayment` (ожидает корзинную форму Order с items — несовместимо с booking-Order без адаптера); Checkout Session hosted (проще UI, но ломает «PaymentIntent»-канон спеки и legacy FSM-события).

## D5. Refund: Stripe Refund API + staff resolution

- **Decision**: четкое разграничение по `cancellationCutoffHours` (default 3h, строго exclusive: `now < startTime - cancellationCutoffHours`). Отмена до cutoff (FR-304) → `stripe.refunds.create({ payment_intent })` в cancel-флоу (Order переходит в `refunded`; сбой refund → Order `REFUND_FAILED` + staff alert, деньги не теряются). Отмена после cutoff (`now >= ...`) → Order `refund_requested` + единый роут для персонала `POST /api/staff/refunds/[id]` (body `{ action: 'approve' | 'reject' }`, авторизация OWNER/OPERATOR — канон plan/tasks). SLA 24h мониторится AuditEvent-временем (авто-эскалации нет — канон «NO UNBOUNDED AUTO-REFUND»).
- **Rationale**: webhook `charge.refunded` закрывает петлю (REFUNDED-статус Order) без polling.

## D6. Cancel/Reschedule-токены: HMAC, защита от сканеров и атомарный обмен

- **Decision**:
  1. **Защита от сканеров (SafeLinks / Antivirus)**: Ссылки из писем ведут на страницы `/booking/cancel` и `/booking/reschedule`. `GET /api/booking/[id]/cancel` и `GET /api/booking/[id]/reschedule` лишь валидируют HMAC-токен и отдают статус/форму, **не сжигая токен**. Потребление токена (`consume`) происходит строго при `POST`-запросе с формы подтверждения пользователем.
  2. **Атомарный перенос (Reschedule)**: Потребление токена не освобождает старый слот сразу. Клиент переходит на `/book?productId=...&rescheduleToken=...`. Старый слот остается `BOOKED`, пока клиент не зафиксирует новый слот. В момент бронирования нового слота в единой drizzle-транзакции: старый слот переходит в `RELEASED`, новый создается, а для `FULL_PREPAYMENT` существующий `orderId` перепривязывается к новому `SlotReservation` без повторного снятия денег с карты. Если клиент прерывает выбор — исходная запись в безопасности.
- **Rationale**: исключает потерю слота при случайном закрытии вкладки и защищает токены от уничтожения почтовыми роботами.

## D7. Reminder: Периодический крон-свип + CAS

- **Decision**: Периодический крон-воркер `jobs/reminderJob.ts` (запускается каждые 5 минут). Запрос находит кандидатов:
  `SELECT id FROM slot_reservations WHERE status = 'BOOKED' AND reminder_sent_at IS NULL AND start_time - make_interval(hours => 24) <= now() AND start_time > now()`
  Для каждого кандидата выполняется атомарный CAS UPDATE:
  `UPDATE slot_reservations SET reminder_sent_at = now() WHERE id = $1 AND reminder_sent_at IS NULL AND status = 'BOOKED' RETURNING id`
  Если строка обновилась — воркер отправляет email через Resend и пишет в `EmailDeliveryLog`. Если строка не обновилась — параллельный воркер уже забрал задачу. Ошибка Resend → откат флага в БД → автоматический подхват на следующем тике крона.
- **Rationale**: автономная модель свипа не требует отмены запланированных джобов при переносе (reschedule) или отмене брони; CAS гарантирует ровно одну отправку на гонке.
