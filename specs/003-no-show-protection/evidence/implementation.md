# Implementation Evidence: 003-no-show-protection

**Implemented**: 2026-11-08 · **Tasks**: T310–T360 (8/8) · **Gate override**: `reviews/_gate-override.md` (owner approval, 1/2 external)

## Gate 0 (exit) — all green

| Gate | Result |
| --- | --- |
| `npm run validate` (tsc --noEmit) | **0 errors** |
| `npm run lint` | **0 errors** (warnings — pre-existing `no-explicit-any` profile, incl. canon `db: any` from 002) |
| `npm run test:int` | **129/129 passed** (108 legacy + 21 new), 3 consecutive full runs green (re-run-safe DB hygiene via `tests/int/helpers/reset003.ts`) |
| `npm run build` | **0 exit** |
| `pnpm audit --prod` | **0 H/C** (1 low + 1 moderate, pre-existing) |
| `pnpm generate:types` | regenerated (`payload-types.ts` — TypedJobs + new collections/fields) |

## What shipped (per task)

- **T310**: Product `paymentMode` (NONE default) + `cancellationCutoffHours`; `lib/payments/amounts.ts` (`toAmountMinor` Math.round-canon + `isBeforeCancellationCutoff` exclusive-boundary helper); server-side paymentMode derivation in `bookingService` (client field structurally absent from API contract).
- **T311**: PREPAID-ветка `createBooking` — atomic HELD (TTL 15m) + Order (amount = minor units) + AuditEvent в advisory-lock транзакции; **PaymentIntent строго после коммита** (no orphan payments); PI-failure → немедленный RELEASED + `PAYMENT_INIT_FAILED` 502 (никогда не маринуем слот); `PaymentGateway` seam для тестов.
- **T320**: `InboxEvent` (composite unique `provider+providerRef` — exactly-once gate для `ON CONFLICT DO NOTHING`) + `PaymentEvents` ledger; `webhookHandlers.ts` через **штатный** endpoint плагина (`webhooks` prop, SDK-верификация подписи осталась плагину); dedupe+processing в ОДНОЙ транзакции (сбой → 5xx → ретрай Stripe → идемпотентная до-обработка); `assertProviderAmountMatch` в живом пути (mismatch → ledger + alert, FSM не тронут); late-webhook → re-confirm при свободном слоте / `paid_requires_resolution` при re-book (никогда тихое PAID).
- **T321**: refund-политика — pre-cutoff (`now < start − cutoff`, exclusive) → Stripe Refund API после коммита → `refunded`; сбой → `refund_failed` + alert (деньги не теряются, верифицируемый хвост); post-cutoff → `refund_requested` + staff route `POST /api/staff/refunds/[id]` (OWNER/OPERATOR, approve/reject); `charge.refunded` webhook закрывает петлю.
- **T330**: `EmailDeliveryLog` (salted-hash PII-канон); `resendAdapter` — fetch, 0 deps, **ленивая** валидация `RESEND_API_KEY` (не ломает build/CI), `RESEND_FROM_EMAIL` → fallback `ShopSettings.fromEmail` → локальный дефолт; confirmation-email через Payload Job `booking-email` (retries 5).
- **T340**: HMAC-токены (`tokens.ts`, timing-safe); scanner-safe GET (просмотр/валидация — не сжигает токен) / POST (потребление) на cancel/reschedule; атомарный обмен слотами — in-place UPDATE одной транзакции (старый слот освобождается строго при фиксации нового, 23P01 → 409 SLOT_TAKEN, старая бронь целая), PREPAID Order остаётся привязан (без повторного списания); replay-детект через audit-trail → `TOKEN_ALREADY_CONSUMED`; acknowledgement CAS bump.
- **T350**: Payload Jobs — `hold-sweep` (минутный крон, lease + CAS, idempotent) + `reminder-sweep` (5-минутный крон, батч-выборка + CAS `reminder_sent_at`, провал Resend → флаг откатывается → ретрай); **`jobs.autoRun` зарегистрирован** (инвариант рантайма из ревью F1); клиентские страницы `/booking/{cancel,reschedule,acknowledge}`.

## Race / security proofs (test artifacts)

- **Double-booking броня 002 не тронута**: gist-race suite зелёный.
- **Webhook replay ×3 → 1 PaymentEvent** (dedupe в транзакции), tampered-signature остаётся 400 на стороне плагина.
- **Late payment после re-book** → `paid_requires_resolution`, второй клиент сохраняет бронь (TC-003-005).
- **CAS reminder**: 2 конкурентных sweep → ровно 1 delivery-log (TC-003-013).
- **Scanner GET не сжигает токен**; replay POST → `TOKEN_ALREADY_CONSUMED` (TC-003-015).
- **Atomic reschedule abort**: SLOT_TAKEN на новом слоте оставляет старую бронь нетронутой (TC-003-016).

## Implementation discoveries (вопросы, которые ревью не могло видеть в коде)

1. **`orders.stripe` группы НЕ существуют в схеме** — плагин ecommerce не персистит adapter group в orders (проверено по `information_schema` в dev и test DB). Добавлено собственное поле `stripePaymentIntentRef` (indexed) в orders-оверрайд; колонка `stripe_payment_intent_ref`.
2. **`orders.amount` — NUMERIC** → pg возвращает СТРОКУ; все money-сравнения коэрсируются `Number(...)` (иначе 4000 !== '4000' → ложный AMOUNT_MISMATCH).
3. **Payload Jobs handler runtime contract** (проверено по `getRunTaskFunction.js`): `{ inlineTask, input, job, req, tasks }` — `payload` берётся из `req.payload`; handler обязан вернуть `{ output, state: 'succeeded' }`.
4. **Payload enum ALTER через pushDevSchema работает** (enum_orders_status получил 4 новых значения в свежей test DB) — отдельная DDL-миграция для статусов не потребовалась; новые колонки/индексы подхвачены тем же механизмом.
5. **Composite unique index** для InboxEvent обязателен: без него `ON CONFLICT DO NOTHING` молча не дедуплицирует (поймано replay-тестом).
6. **tstzrange default bounds `[)`** — касающиеся интервалы НЕ пересекаются; джиттер слот-бакетов в тестах делал их перекрывающимися (~50%) — канон: фиксированные часовые бакеты, дедуп-гигиена через TRUNCATE-хелпер (re-run-safe suite).

## Residual risks / deferred

- **NFR-304 (≤500 MB замер)**: не измерялся в этой сессии (нет sweep-нагрузочного стенда) — перенесён на qa-signoff staging (вместе с live-sandbox Stripe retry, analyze A2/A3).
- **AutoRun в dev**: cron-воркер стартует с сервером (`next start` / prod); в vitest-контуре задачи вызываются напрямую (идемпотентность покрыта юнит-вызовом handlers).
- **Stripe.js подтверждение на /book** (шаблонный CheckoutPage-паттерн) — клиентский этап оплаты для PREPAID; покрывается e2e на qa-signoff.
