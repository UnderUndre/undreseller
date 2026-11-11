# Tasks: 007 (007-booking-trust-gate)

**Input**: spec rev 1.1, plan.md, research.md (D1–D7), requirements-audit PASS (run #2)
**Organization**: Phase 1 intents+OTP → Phase 2 two-phase route+honeypot → Phase 3 waitlist opt-in → Phase 4 seams review → closeout.

## Phase 1: Intents + OTP (US1)

- [ ] T710 [BE] [US1] FR-701: `BookingIntents` коллекция (слаг `booking-intents`, adminOnly, системные поля closed); `src/lib/booking/otp.ts` (6-значный криптоРНГ, `codeHash = HMAC(code, PAYLOAD_SECRET)`, timing-safe verify); `intentService.createIntent` (future-slot guard 422, кап ≤2 live/email → 429 INTENT_CAP, advisory `hashtext('booking_intent_'||email)`); `intentService.verifyIntent` (attempts≤5 → dead, timing-safe); `intentService.consumeIntent` (CAS pending→consumed); sweep-job `intentSweep` (5m: expired >10m → expired; GDPR purge 30d); generate:types
- [ ] T711 [BE] [US1] OTP-письмо (шаблон: код + услуга + слот, TTL-предупреждение) через resend-канон + `EmailDeliveryLog.kind += 'intent'`; rate limit create 3/10min per email+IP; EP/DT-тесты: TTL-матрица, кап, attempts, future-guard

## Phase 2: Two-phase route + honeypot (US1/US2 — Risk 20)

- [ ] T720 [BE] [US1] FR-702/D3: `POST /api/booking` двухфазный (фаза 1 → 202 intent; фаза 2 intentId+otp → verify → CAS consumed → FSM createBooking детерминированным idempotencyKey `booking-intent-<intentId>`; занятый слот → 409 SLOT_TAKEN + intent dead); **STM-тест: concurrent verify одного интента → ровно 1 бронь (CAS), 0 double-booking; brute-force ×5 → dead** (Risk 20); token/attempt-матрица
- [ ] T721 [BE] [US2] FR-703/D5: honeypot-поле на booking + waitlist формах (a11y: aria-hidden/tabindex/-1/autocomplete=off); роут-гварды (заполнено → silent 200 + audit `honeypot.hit`); DT-тесты: silent-reject ×2 формы, человек-не-видит, audit

## Phase 3: Waitlist opt-in (US3)

- [ ] T730 [BE] [US3] FR-704/D6: join → `pending` + opt-in письмо (HMAC `waitlist-optin:<entryId>`, TTL 48h) → `POST /api/waitlist/[entryId]/confirm` → `waiting`; матчинг фильтрует строго `waiting` (relay-guard); sweep pending>48h → expired; landing `/book/waitlist-confirm`; DT-тесты: pending-не-уведомляется, confirm→матчинг, 48h-expiry
- [ ] T731 [BE] [US4/US5] FR-705/706: intent sweep 5m (expired/purge 30d) + кап 2 live/email → 429 INTENT_CAP; allowlist `hasVerifiedEmail` (consumed ≤90d) → skip OTP; EP-тесты: allowlist happy, spoofing-негатив, purge

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
