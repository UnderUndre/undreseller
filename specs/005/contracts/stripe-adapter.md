# Contract: Stripe Adapter (FR-510..516)

> Дополнение к `specs/004-release-readiness/contracts/payment-provider.md` (базовый интерфейс `PaymentProvider` — там). Здесь: Stripe-специфика и consumer-driven матрица расширения.

## 1. Адаптер `lib/payments/stripe.ts`

```ts
export const stripePaymentProvider: PaymentProvider = {
  id: 'STRIPE',
  capabilities: { fiat: true, crypto: false, refunds: 'manual' },
  createInvoice,   // → Checkout Session (ниже)
  verifyCallback,  // stripe-signature HMAC-SHA256 (SDK constructEvent, timing-safe)
  parseCallback,   // event → { providerPaymentId, orderId, status, paidMinor, quotedMinor }
};
registerPaymentProviderFactory('STRIPE', () => stripePaymentProvider);
```

## 2. createInvoice (FR-511/511a)

```
POST-зависимость: stripe.checkout.sessions.create({
  mode: 'payment',
  expires_at: now + PREPAID_HOLD_TTL_MS/1000,   // 15 мин = hold-TTL 004, НЕ 30
  line_items: [{ price_data: { currency, unit_amount: amountMinor, product_data: { name } }, quantity: 1 }],
  metadata: { orderId },
  success_url / cancel_url: инстанс,
  // payment_method_types НЕ передаётся — dashboard-driven (Apple/Google Pay после регистрации домена)
}, { idempotencyKey: `inv_${orderId}` })
```

**Порядок операций (FR-511a)**: сессия создаётся ДО фиксации холда. Stripe 5xx/timeout/network → холд НЕ ставится, бронь не создаётся, HTTP 503 + retry-сообщение, audit `STRIPE_INVOICE_FAILED` (errorCode; без PII). Успех → холд (`PAYMENT_PENDING`, holdExpiresAt = +15 мин) → редирект на `session.url`.

## 3. Вебхук `POST /api/payments/stripe/webhook` (FR-514)

1. Тело — строго `req.text()`; verify через `stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET)` → исключение = 401, zero processing, security-лог.
2. Дедуп ПЕРВЫМ шагом: `InboxEvent` insert `dedupeKey = stripe_<event.id>` (ON CONFLICT → 200 `{deduplicated:true}`) — до любых записей.
3. FSM-маппинг (спека §3): `completed→BOOKED/PAID + PaymentAllocationLink`; `expired→RELEASED/PAYMENT_EXPIRED` (только если статус ещё PAYMENT_PENDING/HELD и не заморожен — условный updateMany); `payment_failed→` ожидание ретрая (без смены статусов) + TG-напоминание; `charge.refunded→RefundOperation(STRIPE, stripe_dashboard) + CANCELLED`.
4. Переотправки Stripe (до 3 суток, бэкофф) дедупятся тем же ключом.

## 4. Consumer-driven contract tests (расширение матрицы 004)

| Сценарий | Ожидание |
|---|---|
| stubbed `checkout.session.completed` валидный | BOOKED + PAID + PaymentAllocationLink(provider STRIPE, cs_/pi_), уведомления обеим сторонам |
| replay: `Promise.all` ×100 одинаковых event | 1 эффект, 99 `{deduplicated:true}` |
| `completed` с суммой < квоты (не Stripe-кейс, но матрица) | UNDERPAID путь 004 (не автоподтверждение) |
| `completed` по уже BOOKED (потерян дедуп) | no-op (условный updateMany) |
| `expired` при живом PAYMENT_PENDING | RELEASED + PAYMENT_EXPIRED, слот свободен |
| `expired` при замороженном холде (holdFrozenAt) | нет перехода (freeze-канон 004) |
| `expired` после `completed` (гонка) | ровно один переход (дедуп+условность), второй — no-op |
| `payment_intent.payment_failed` | статусы не меняются, TG-напоминание о retry |
| `charge.refunded` | RefundOperation(kind STRIPE, actor stripe_dashboard) + CANCELLED + слот свободен |
| invalid signature (подменён/отсутствует/чужой секрет) | 401, ноль записей, security-лог |
| Stripe 5xx при createInvoice | холд не поставлен, 503, `STRIPE_INVOICE_FAILED`, повтор с тем же Idempotency-Key безопасен |
| JPY (minorUnit 0) / KWD (3) в line_items | unit_amount ровно в minor units (без ×100) |
| TTL сессии | `expires_at - now ∈ [14.9, 15.1]` мин (равен PREPAID_HOLD_TTL_MS) |

## 5. STRIDE-примечание

Spoofing: signature + raw body; Tampering: суммы против registry minor units + квота; Repudiation: InboxEvent + PaymentAllocationLink + RefundOperation (неизменяемый аудит); DoS: идемпотентность + условные переходы (шторм вебхуков = O(1) эффект); Elevation: вебхук не несёт авторизационных решений.
