# Implementation Evidence: 006-waitlist-autofill

**Implemented**: 2026-11-11 · **Tasks**: T610–T640 (8/8) · **Gate override**: `reviews/_gate-override.md` (owner approval, 1/2 external)

## Gate 0 (exit) — all green

| Gate | Result |
| --- | --- |
| `npm run validate` (tsc --noEmit) | **0 errors** |
| `npm run lint` | **0 errors** (2 caught-and-fixed: impure-call-in-render на claim page, prefer-const) |
| `npm run test:int` | **164/164 passed** (153 legacy + 11 new), мультипрогоны |
| `npm run build` | **0 exit** |
| `pnpm audit --prod` | **0 H/C** (1 low + 1 moderate, pre-existing) |
| `pnpm generate:types` | regenerated (WaitlistEntries + TypedJobs + EmailDeliveryLog.kind) |
| **New deps** | **0** (NFR-602) |

## What shipped (per task)

- **T610**: коллекция `WaitlistEntries` (слаг `waitlist-entries` — F2; системные поля закрыты `access:false` + readOnly; композитные индексы `(resource_id, service_id, status)` и `(phone, status)` — F13); `waitlistService.join`: **hashtext-канон advisory lock** `hashtext('waitlist_join_'||phone)` (re-check R2), Blacklist → 403 (F11), окно `now < expiresAt <= now+60d` (F8), кап 3/телефон, дубль 409; `POST /api/waitlist` (rate limit 10/60s) + audit `waitlist.join`.
- **T611**: `claimToken.ts` — раздельные токены (F10): claim = HMAC `waitlist-claim:v<N>:<entryId>:<slotStartIso>` (криптопривязка к слоту — F1), unsubscribe = HMAC без TTL; `EmailDeliveryLog.kind += 'waitlist'` + `logDelivery` typing (F13).
- **T620**: **все 6 точек RELEASED** вызывают `notifySlotFreed` (F6): cancelBooking, approveBooking-reject, releaseAfterPaymentInitFailure, applyGatewayEvent payment_failed, cancelBookingByClientChat, holdSweep releaseExpiredHolds; каждый — best-effort try/catch (release-path не блокируется); past-slot guard `start > now` (F8); Payload Job `waitlist-match`: FIFO top-5, atomic campaign claim-mark (статус-гвард), `expiresAt >= slotStart`, письма через Resend-канон с claim/unsub-ссылками.
- **T621**: `POST /api/waitlist/[entryId]/claim` — verify HMAC (slotStart строго из БД — F1), CAS `notified→converted`, `createBooking` через FSM (FREE→CONFIRMED / PREPAID→HELD 15m + gateway seam), **детерминированный idempotencyKey** (F9); **409 → честный re-arm без auto-advance** (F4); co-candidates партии → re-arm без списания кампании.
- **T622**: claim-страница `/book/waitlist-claim` (explicit Confirm — D6; 409 → честный отказ — F9), `WaitlistJoinForm` в SlotGrid «No available slots» ветке, unsubscribe-страница.
- **T630**: `waitlist-sweep` **крон 5m** (F7): horizon-expiry, stale-campaign (notified>30m) → auto-advance ТОЛЬКО на свободный слот / кап 3 → expired + финальное письмо / re-arm; unsubscribe + auto-advance; GDPR purge waitlist 90d (F11); коллекция + задачи зарегистрированы в payload.config.

## Proof artifacts (11 новых тестов, TC-006-001..016)

- **Claim-гонка ×100** (5 notified кандидатов, каждый по 20 повторов): ровно 1 CONFIRMED, 0 double-booking, со-кандидаты re-armed — TC-006-007 (Risk 20).
- **Камп-кап 3**: 3 кампании → 4-я не уведомляет; изоляция на dedicated service.
- **FIFO top-5**: 7 кандидатов → 5 notified + 2 waiting; past-slot → 0.
- **Join-матрица**: кап BVA 3/4, дубль 409, blacklist 403, email-required 400, horizon 400.
- **Token-матрица**: valid/replay-after-converted/wrong-token → 403.
- **Lifecycle**: horizon-expiry, stale-campaign re-arm + auto-advance, unsubscribe + auto-advance на будущий слот.
- **PII-grep**: письма/ссылки без телефона.

## Implementation discoveries

1. **Payload relationship-колонки получают суффикс `_id`**: поле `serviceId` → колонка `service_id_id` (не `service_id`) — все raw-SQL матчинга переписаны; в SELECT алиасы `AS service_id` возвращают TS-типизацию.
2. **slot_reservations.resource_id — varchar** (текстовое поле 002), а waitlist_entries.resource_id_id — integer: сравнение в SQL требует строкового параметра, не `::numeric`.
3. **tstzrange($2,$3) с текстовыми параметрами требует `::timestamptz` кастов** — иначе 42883 (no operator matches).
4. **pushDevSchema требует полного рестарта dev-сервера**: hot-reload конфига не пушит новые коллекции — таблица `waitlist_entries` появилась только после рестарта.
5. **Тест-изоляция waitlist**: матчинг глобален по (service, resource) — тесты обязаны жить на **dedicated services** (seed per test), иначе FIFO top-5 захватывает entries соседних тестов; fake-Resend должен наслаиваться (base-fake в beforeAll + counting-wrapper в тесте), иначе restore после первого теста убивает транспорт для остальных.

## Residual risks / deferred

- Реальные письма через Resend prod-ключ и live-клик по claim-ссылке — на qa-signoff staging (канон 003–005).
- Payload Jobs `waitlist-match` enqueue из `payload.jobs.queue` — рантайм-подхват воркером (autoRun */30s) проверен на dev-стенде косвенно; прямая проверка доставки писем ≤60c — staging.
- TG-канал (TgLinkByPhone), мультиресурсный матчинг — enhancement 007+.
