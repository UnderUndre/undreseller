# Research: 007-booking-trust-gate

> Plan Phase 0 — Engineering Decisions (D1–D6). Grounding: 001–006 as-built (`a66eed5`) + OWASP Bot Management Cheat Sheet (L2) + manual-QA `4c0d1ab`.

## D1. Верификация до захвата слота: **BookingIntent** (не новый FSM-статус)

- **Decision**: OTP-гейт реализуется через отдельную лёгкую коллекцию `booking-intents` (email, name, phone, serviceId, resourceId, slotStart/End, codeHash, expiresAt, attempts, status `pending|consumed|dead|expired`). FSM 001/002 НЕ расширяется: слот захватывается FSM `CREATE_BOOKING` только после верификации. Интент — не бронь: он не держит слот, не входит в GiST, не пишется в AuditEvents как бронь.
- **Rationale**: новый статус брони = правка kernel (двухтрековая машина, GiST partial index, свипы) — каскадный риск по всем 6 спекам ради антиспам-фичи. Интент дешевле, изолирован и Purge-ится через 30d.
- **Alternatives**: новый FSM-статус `PENDING_VERIFICATION` (отвергнут — kernel-инвазия); verify-after-create (отвергнут — слот отравляется unverified-бронями в окне TTL).

## D2. OTP-канон: HMAC + attempts-гейт (audit C1)

- **Decision**: 6-значный код генерится криптоРНГ; в БД — только `codeHash = HMAC(code, PAYLOAD_SECRET)`; verify — timing-safe. `attempts` инкрементится на каждой неверной попытке; `attempts >= 5` → статус `dead` (403), пересоздание через новую фазу 1. TTL кода 10m = expiresAt интента.
- **Rationale**: 10⁶ комбинаций / 5 попыток = брутфорс невозможен в принципе; HMAC защищает от утечки через дамп БД (канон 003 cancel_token_hash / 005 claim token).

## D3. Двухфазный роут: единый `POST /api/booking` (без новых роутов)

- **Decision**: фаза определяется наличием `intentId+otp` в теле. Фаза 1: валидация (bookable/future/grid по computeSlots-канону) → интент (advisory `hashtext('booking_intent_'||email)`) → OTP-письмо → 202. Фаза 2: verify → `bookingService.createBooking` (детерминированный `idempotencyKey = booking-intent-<intentId>`) → intent `consumed` → 201. Ошибки: занятый слот → 409 SLOT_TAKEN + intent `dead`.
- **Rationale**: один эндпоинт = один rate-limit контур, один контракт; фронт меняется минимально (доп. поле OTP + состояние «код отправлен»).

## D4. Repeat-client allowlist: verified-история как пропуск (FR-706)

- **Decision**: `hasVerifiedEmail(email)` = `EXISTS(SELECT 1 FROM booking_intents WHERE customer_email = X AND status = 'consumed' AND updated_at > now()-90d)` → фаза 2 выполняется без OTP (booking сразу). Реюз consumed-интенов как verified-реестра — ноль новых коллекций.
- **Rationale**: конверсия-first для настоящих клиентов; спуфинг требует доступа к почтовому ящику; rate limit и honeypot продолжают работать.

## D5. Honeypot: клиентский hidden-field + серверный silent-reject (FR-703)

- **Decision**: формы (booking + waitlist join) получают `<input name="companyWebsite" ... aria-hidden="true" tabindex="-1" autocomplete="off" className="hidden">`; роуты при заполненном поле → **silent 200/201-заглушка без эффекта** + audit `honeypot.hit`.
- **Rationale**: OWASP/Auth0 канон; ноль friction для людей; бот выдаёт себя заполнением.

## D6. Waitlist double-opt-in (FR-704, анти-релей C2)

- **Decision**: join → статус `pending` + confirm-письмо (HMAC `waitlist-optin:<entryId>`, TTL 48h) → `waiting`. Матчинг фильтрует строго `status='waiting'`. Sweep: pending > 48h → `expired`. Unsub-канон 006 сохранён.
- **Rationale**: Resend-релей на неподтверждённые адреса = бан домена + GDPR-письма без согласия; double-opt-in — маркетинговый стандарт.

## D7. Seams code review как фаза спеки (FR-707)

- **Decision**: T740 — документированный ревью-проход швов booking↔waitlist↔intent↔email (чек-лист класса manual-QA: function-props Server→Client, маунты, роут-коллизии slug vs /api, relationship `_id` суффиксы, impure-render lint) с фиксом находок и отчётом в evidence.
- **Rationale**: manual QA `4c0d1ab` показала: этот класс не ловится int-контуром; внутрь спеки — дешевле отдельного ревью-цикла.
