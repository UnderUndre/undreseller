# Research: 007-booking-trust-gate

> Plan Phase 0 — Engineering Decisions (D1–D6). Grounding: 001–006 as-built (`a66eed5`) + OWASP Bot Management Cheat Sheet (L2) + manual-QA `4c0d1ab`.

## D1. Верификация до захвата слота: **BookingIntent** (не новый FSM-статус)

- **Decision**: OTP-гейт реализуется через отдельную лёгкую коллекцию `booking-intents` (email, name, phone, serviceId, resourceId, slotStart/End, codeHash, expiresAt, attempts, статус-машина `pending→consumed|dead|expired`). FSM 001/002 НЕ расширяется: слот захватывается FSM `CREATE_BOOKING` только после верификации. Интент — не бронь: он не держит слот, не входит в GiST, не пишется в AuditEvents как бронь.
- **Rationale**: новый статус брони = правка kernel (двухтрековая машина, GiST partial index, свипы) — каскадный риск по всем 6 спекам ради антиспам-фичи. Интент дешевле, изолирован и Purge-ится через 30d.
- **Alternatives**: новый FSM-статус `PENDING_VERIFICATION` (отвергнут — kernel-инвазия); verify-after-create (отвергнут — слот отравляется unverified-бронями в окне TTL).

## D2. OTP-канон: HMAC + attempts-гейт (audit C1)

- **Decision**: 6-значный код генерится криптоРНГ; в БД — только `codeHash = HMAC(code, PAYLOAD_SECRET)`; verify — timing-safe. `attempts` инкрементится на каждой неверной попытке; `attempts >= 5` → статус `dead` (403), пересоздание через новую фазу 1. TTL кода 10m = expiresAt интента.
- **Rationale**: 10⁶ комбинаций / 5 попыток = брутфорс невозможен в принципе; HMAC защищает от утечки через дамп БД (канон 003 cancel_token_hash / 005 claim token).

## D3. Двухфазный роут: единый `POST /api/booking` (без новых роутов)

- **Decision**: фаза определяется наличием `intentId+otp` в теле; **все параметры брони гидратируются строго из верифицированной БД-записи интента — тело запроса кроме `intentId`/`otp` игнорируется (review F5, confused-deputy)**. Фаза 1: валидация (bookable/future/grid по computeSlots-канону) → интент (advisory `hashtext('booking_intent_'||email)`) → OTP-письмо → 202. **Resend (review F2): `{ intentId, resend: true }` ротирует codeHash + refresh expiresAt на СУЩЕСТВУЮЩЕМ pending-интенте (дубликаты не плодятся), лимит ≤3/10 мин на интент.** Фаза 2: verify (attempts ≤5 → dead) → `bookingService.createBooking` (детерминированный `idempotencyKey = booking-intent-<intentId>`) → **CAS consumed строго ПОСЛЕ успешного createBooking (review F4)** → 201. Ошибки: занятый слот → 409 SLOT_TAKEN + intent `dead` (никогда не re-arm); повтор с consumed-статусом → существующая бронь по idempotencyKey.
- **Rate limit (review F3): композитные независимые бакеты** — per-IP ≤10 созданий интентов/10 мин (независимо от email) + per-email ≤3/10 мин (независимо от IP); раздельно блокирует email-бомбардировку с одного IP и распределённую атаку по одному адресу.
- **Rationale**: один эндпоинт = один rate-limit контур, один контракт; фронт меняется минимально (доп. поле OTP + состояние «код отправлен»).

## D4. Repeat-client allowlist: verified-история как пропуск (FR-706)

- **Decision (review F1 — email-allowlist отвергнут как спуфируемый)**: в гостевой модели проверка «email в consumed-истории» без доказательства владения открывает боту бронирование от имени чужого известного email. Вместо этого: **HttpOnly+Secure+SameSite=Lax cookie `client_trust_token` (HMAC email+issuedAt, TTL 90d), выдаётся при успешной OTP-верификации (фаза 2 → 201)**. Booking с валидным cookie → skip OTP; без cookie → OTP обязателен. consumed-интенты хранятся 90d (retention источник F7).
- **Rationale**: конверсия-first для настоящих клиентов; спуфинг требует доступа к почтовому ящику; rate limit и honeypot продолжают работать.

## D5. Honeypot: клиентский hidden-field + серверный silent-reject (FR-703)

- **Decision**: формы (booking + waitlist join) получают `<input name="companyWebsite" ... aria-hidden="true" tabindex="-1" autocomplete="off" className="hidden">`; роуты при заполненном поле → **silent 200/201-заглушка без эффекта** + audit `honeypot.hit`.
- **Rationale**: OWASP/Auth0 канон; ноль friction для людей; бот выдаёт себя заполнением.

## D6. Waitlist double-opt-in (FR-704, анти-релей C2)

- **Decision**: join → статус `pending` + opt-in письмо, ведущее на **лендинг `/book/waitlist-confirm` (GET — просмотр, подтверждение — явная кнопка POST; scanner-safe против SafeLinks — review F9)** → `waiting`. Повторный join того же телефона/сервиса в `pending` → resend opt-in-письма на существующую запись (до 48h). Матчинг фильтрует строго `status='waiting'`. Sweep: pending > 48h → `expired`. Unsub-канон 006 сохранён.
- **Rationale**: Resend-релей на неподтверждённые адреса = бан домена + GDPR-письма без согласия; double-opt-in — маркетинговый стандарт.

## D7. Seams code review как фаза спеки (FR-707)

- **Decision**: T740 — документированный ревью-проход швов booking↔waitlist↔intent↔email (чек-лист класса manual-QA: function-props Server→Client, маунты, роут-коллизии slug vs /api, relationship `_id` суффиксы, impure-render lint) с фиксом находок и отчётом в evidence.
- **Rationale**: manual QA `4c0d1ab` показала: этот класс не ловится int-контуром; внутрь спеки — дешевле отдельного ревью-цикла.
