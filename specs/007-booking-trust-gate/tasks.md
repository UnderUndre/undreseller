# Tasks: 007 (007-booking-trust-gate)

**Input**: spec rev 1.2, plan.md, research.md (D1–D7), requirements-audit PASS (run #3), antigravity review fixes F1–F10
**Organization**: Phase 1 intents+OTP → Phase 2 two-phase route+honeypot → Phase 3 waitlist opt-in → Phase 4 seams review → closeout.

## Phase 1: Intents + OTP (US1)

- [ ] T710 [BE] [US1] FR-701: `BookingIntents` коллекция (слаг `booking-intents`, adminOnly, системные поля closed); `src/lib/booking/otp.ts` (6-значный криптоРНГ, `codeHash = HMAC('otp:'+intentId+':'+email+':'+code, PAYLOAD_SECRET)` — контекст-биндинг F6, timing-safe verify); `intentService.createIntent` (future-slot guard 422, кап ≤2 live/email → 429 INTENT_CAP, advisory `hashtext('booking_intent_'||email)`, **композитный rate limit: per-IP 10/10min + per-email 3/10min независимыми бакетами (F3)**); `intentService.verifyIntent` (attempts≤5 → dead, timing-safe, **HMAC контекст-биндинг intentId+email (F6)**); `intentService.consumeIntent` (CAS pending→consumed); sweep-job `intentSweep` (5m: только expired pending→expired (F10), purge → ночной GDPR); generate:types
- [ ] T711 [BE] [US1] OTP-письмо (шаблон: код + услуга + слот, TTL-предупреждение) через resend-канон + `EmailDeliveryLog.kind += 'intent'`; rate limit create 3/10min per email+IP; EP/DT-тесты: TTL-матрица, кап, attempts, future-guard

## Phase 2: Two-phase route + honeypot (US1/US2 — Risk 20)

- [ ] T720 [BE] [US1] FR-702/D3: `POST /api/booking` двухфазный (фаза 1 → 202 intent + композитный RL (F3); **resend = ротация codeHash/refresh expiresAt на существующем pending-интенте (F2), ≤3/10 мин на интент**; фаза 2 intentId+otp → verify attempts≤5 → **гидратация параметров строго из БД-интента (F5)** → createBooking детерминированным idempotencyKey `booking-intent-<intentId>` → **CAS consumed строго после успеха (F4)**; занятый слот → 409 SLOT_TAKEN + intent dead; повтор при consumed → существующая бронь по idempotencyKey); **STM-тесты: concurrent verify одного интента → ровно 1 бронь; brute-force ×5 → dead; спуфинг тела фазы 2 игнорируется** (Risk 20); token/attempt-матрица
- [ ] T721 [BE] [US2] FR-703/D5: honeypot-поле на booking + waitlist формах (a11y: aria-hidden/tabindex/-1/autocomplete=off); роут-гварды (заполнено → silent 200 + audit `honeypot.hit`); DT-тесты: silent-reject ×2 формы, человек-не-видит, audit

## Phase 3: Waitlist opt-in (US3)

- [ ] T730 [BE] [US3] FR-704/D6: join → `pending` + opt-in письмо → **лендинг `/book/waitlist-confirm` (GET просмотр, подтверждение явной кнопкой POST — scanner-safe против SafeLinks (F9))** → `waiting`; **повторный join того же телефона/сервиса в pending → resend opt-in-письма (F9)**; матчинг фильтрует строго `waiting` (relay-guard); sweep pending>48h → expired; DT-тесты: pending-не-уведомляется, confirm→матчинг, scanner-safe GET, 48h-expiry, resend
- [ ] T731 [BE] [US4/US5] FR-705/706: intent sweep 5m (только expired pending→expired (F10); purge → ночной GDPR); **trust-cookie (F1): HttpOnly+Secure+SameSite=Lax `client_trust_token` (HMAC email+issuedAt, TTL 90d), выдаётся при успешной OTP-верификации; booking с валидным cookie → skip OTP; без cookie → OTP**; EP-тесты: cookie happy, без-cookie OTP, spoofing-негатив, purge

## Phase 4: Seams review + closeout (US6)

- [ ] T740 [BE] [US6] FR-707: документированный code review швов booking↔waitlist↔intent↔email (чек-лист manual-QA класса: function-props Server→Client, маунты, роут-коллизии, relationship `_id` суффиксы, impure-render) с фиксами; отчёт в evidence; закрывает finding-класс `4c0d1ab`
- [ ] T741 [SETUP] Регрессия: generate:types, полный гейт 0 exit (validate/lint/int/build), 164+ старых зелёные, evidence (brute-force лог, OTP-матрица, honeypot-лог, p95-замер), tasks-статусы

## Dependency Graph

```
T710 → T711, T720
T711 → T720
T720 → T721, T730, T731
T721 → T740
T730 → T740
T731, T740 → T741
```

### Self-Validation
- [x] IDs существуют, циклов нет, orphan'ов нет

**Critical Path**: T710 → T711 → T720 → T721 → T740 → T741 (6 задач). **Total**: 8 задач.

## Parallel Lanes

| Lane | Tasks | Blocked By |
| ---- | ----- | ---------- |
| 1 | T710 → T711 | — |
| 2 | T720 → T721, T730, T731 | T710, T711 |
| 3 | T740 | T721, T730 |
| 4 | T741 | все |

## Agent Dispatch

| Agent | Tasks |
| ----- | ----- |
| [BE] | T710, T711, T720, T721, T730, T731, T740 |
| [SETUP] | T741 |

## Notes
- TDD-Lite; Risk 20 (T720) → STM+DT+EG до кода; OTP = HMAC-only (audit C1); error-catalog: INTENT_CAP/INTENT_DEAD/OTP_INVALID/BLACKLISTED — снапшот-сьют расширяется; все 164+ старых теста вызывают createBooking сервисно — роут-контракт не ломает их.
