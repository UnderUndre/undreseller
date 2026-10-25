# Quickstart: 005 Tracer Bullet

> Минимальный end-to-end путь: интерфейс → сервис → БД — ранний смоук всего релиза. Локально, без реальных денег (test-mode ключи Stripe).

## 0. Пререквизиты

```bash
# .env дополнения (локально)
PAYMENT_PROVIDERS=NOWPAYMENTS,STRIPE
STRIPE_SECRET_KEY=sk_test_...        # test mode
STRIPE_WEBHOOK_SECRET=whsec_...      # из `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`
ARGON2_M_KIB=65536
ARGON2_T=3
ARGON2_P=4
npx prisma migrate deploy             # 20261101000000_005 — expand
node scripts/backfill-005-reject-notify-mode.ts
```

Stripe Dashboard (test): домен `localhost` зарегистрирован в payment domains — иначе Apple/Google Pay не покажутся (FR-511 deployment note).

## 1. Трейсер (≤15 минут)

1. **Auth-hardening смоук**: войти OWNER'ом на `/admin/login` (существующий scrypt-пароль) → сессия валидна; в БД: `account.passwordAlgo = "argon2id"` (пере-хеш произошёл), `session.epochCreated = user.sessionEpoch = 1`. Повторный логин — тем же паролем, теперь Argon2id-путь.
2. **Мгновенный отзыв**: SQL `UPDATE "user" SET "sessionEpoch" = 2 WHERE id = <owner>;` → следующий запрос в админку = 401 (равенство сломано).
3. **Stripe-трейсер**: создать SERVICE с `requiresFullPrepayment = true` (админка → каталог) → витрина → бронь → `createInvoice` (сессия ДО холда; `expires_at` = +15 мин) → редирект на `checkout.stripe.com` (test card `4242 4242 4242 4242`) → `stripe listen` доставляет `checkout.session.completed` → БД: `SlotReservation.status = BOOKED`, `Order.status = PAID`, `PaymentAllocationLink(provider=STRIPE)`, `InboxEvent(dedupeKey=stripe_evt_...)`.
4. **Replay-смоук**: переотправить тот же event из Stripe CLI (`stripe events resend evt_...`) ×3 → ответ `{deduplicated:true}`, состояние БД неизменно.
5. **Отказ Stripe**: выключить сеть/подменить ключ на невалидный → бронь prepaid-услуги → 503 + `STRIPE_INVOICE_FAILED` в аудит-логе; слот НЕ занят (проверить слоты на дату).

## 2. Критерий прохождения

Все 5 шагов дают точные ожидаемые состояния БД/UI выше; `npm run validate` + `npm test` зелёные. Трейсер гоняется на свежем клоне до старта tasks-фазы (интеграционные дыры ловим до распила на задачи).
