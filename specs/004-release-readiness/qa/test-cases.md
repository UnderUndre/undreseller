# Test Cases — 004-release-readiness (manual, staging-runnable)

> ISO/IEC/IEEE 29119-4:2021 techniques; formal specs `TC-004-[NNN]` grouped by user story.
> **Environment prerequisites (global)**: staging instance `SHOP_URL` (e.g. `https://shop.underundre-staging.example`), Telegram client account + test bot (`@undre_test_bot`), staff accounts `owner@test / St4ff!Pass1`, `operator@test / St4ff!Pass1`, `performer@test / St4ff!Pass1`, Telegram-identified client `@client_a` (Telegram id 900001, email `client.a@test.dev`), `@client_b` (no email), crypto sandbox (NowPayments sandbox API key in staging env), R2 test bucket credentials. Cases requiring a specific prerequisite are marked: [CRYPTO] [TG] [R2] [DB].
> Anti-slop: ≥40% negative/boundary — marked Type `NEG`/`BND`. All expectations deterministic (exact HTTP code / UI text / DB state).

---

## US1 — Trustworthy Payments & Booking Integrity

### TC-004-001 — FREE track: IN_CALL auto-confirm
- **Traceability**: FR-403, FR-407 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: shop with zero payment providers (or `requiresFullPrepayment=false` service `Стрижка` 30 min, 1500 minor); staff approval OFF; slot free today 14:00.
- **Test Data**: service `Стрижка` (id 1), slot `today 14:00`, client contact `+79001112233`, TG `@client_a`.
- **Steps**:
  1. Open `SHOP_URL` Mini App (or via bot menu button).
  2. Tap `Стрижка` → tap `14:00` → tap `Подтвердить`.
  3. Open Admin `/admin/bookings` as `owner@test`.
- **Expected**: Step 2 shows confirmation screen with state text `Подтверждено` (no payment step). Admin booking row status = `BOOKED` (≡ CONFIRMED), no `holdExpiresAt` value.
- **Post-conditions**: slot 14:00 shows as booked; delete via cancel API if needed.

### TC-004-002 — FREE track: OUT_CALL → PENDING_APPROVAL → staff approve
- **Traceability**: FR-403 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: OUT_CALL service `Выезд` enabled; staff bot logged in as `operator` TG account.
- **Test Data**: service `Выезд` (id 2), address `ул. Ленина 1, кв. 2`, slot tomorrow 10:00.
- **Steps**:
  1. Book `Выезд` tomorrow 10:00 with address `ул. Ленина 1, кв. 2` from client bot.
  2. In staff bot open the incoming booking card.
  3. Press `Подтвердить` (approve).
- **Expected**: Step 1 client message text contains `ожидает подтверждения` (not `Подтверждено`). Step 3 staff bot replies card status `Подтверждено`; client receives TG confirmation; admin row status `BOOKED`.
- **Post-conditions**: booking exists CONFIRMED; cancel to clean up.

### TC-004-003 — FREE track: OUT_CALL staff reject → slot released + client notified
- **Traceability**: FR-403, FR-429 · **Tier**: Regression · **Priority**: P1 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: pending OUT_CALL booking exists (repeat TC-004-002 step 1).
- **Steps**:
  1. In staff bot press `Отклонить` on the pending card (complete the 2-press barrier, see TC-004-064).
  2. Check client TG chat.
  3. GET `SHOP_URL/api/booking/slots?serviceId=2&date=<tomorrow>` as anonymous.
- **Expected**: Step 2 client gets rejection notice per STAFF_REJECT_NOTIFY_MODE (text `Заявка отклонена`). Step 3 slot `10:00` no longer in `unavailable[]` — it is offerable again.
- **Post-conditions**: booking row status `STAFF_REJECTED`.

### TC-004-004 — PREPAID: HELD 15 min → invoice via provider URL
- **Traceability**: FR-403, FR-402, FR-407 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: [CRYPTO] NowPayments sandbox configured; service `Окрашивание` (id 3) with `requiresFullPrepayment=true`.
- **Test Data**: service `Окрашивание`, slot tomorrow 12:00, amount `250000` minor (2500.00).
- **Steps**:
  1. Book `Окрашивание` tomorrow 12:00 in Mini App.
  2. Inspect checkout screen payment button `href`.
  3. In DB (read-only) `SELECT status,"holdExpiresAt" FROM "Reservation" ORDER BY id DESC LIMIT 1;`
- **Expected**: Step 2 `href` host matches `nowpayments`-provider invoice URL (NOT a hand-built `/pay?order=…` link). Step 3 status `PAYMENT_PENDING`-lineage row `HELD`/`PAYMENT_PENDING` and `holdExpiresAt` = now + 15:00 ±5 s.
- **Post-conditions**: pay in sandbox (TC-004-008) or let TTL expire.

### TC-004-005 — PREPAID: HELD TTL expiry → slot AVAILABLE [BND]
- **Traceability**: FR-403 · **Tier**: Regression · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA 7-point, ST
- **Pre-conditions**: prepaid booking created at T0, not paid; sweeper enabled.
- **Test Data**: hold created at T0; probe GETs at T0+14:30, T0+14:59, T0+15:00, T0+15:01.
- **Steps**:
  1. Create prepaid hold (repeat TC-004-004 step 1), do NOT pay.
  2. At T0+14:30 GET `slots?date=<tomorrow>` — expect 12:00 unavailable.
  3. At T0+15:01 GET slots again; check client TG for expiry message; DB row status.
- **Expected**: Step 2 slot blocked. Step 3 slot `12:00` available; DB status `EXPIRED`; client message contains `Время оплаты истекло`.
- **Post-conditions**: none (slot free).

### TC-004-006 — Confirming freeze: hold survives past TTL (observable: staff card status)
- **Traceability**: FR-404 · **Tier**: Regression · **Priority**: P0 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: [CRYPTO] sandbox payment created and moved to `confirming` (sandbox dashboard or stub callback with valid HMAC).
- **Steps**:
  1. Create prepaid hold and pay `100` sandbox units → wait for sandbox `confirming` webhook.
  2. Wait past `holdExpiresAt` (TTL+2 min).
  3. Open staff bot booking card for the client.
  4. GET `slots?date=<tomorrow>`.
- **Expected**: Step 3 staff card shows payment status `Оплата подтверждается` (frozen, not expired). Step 4 slot still NOT available. DB `holdFrozenAt` NOT NULL, `holdExpiresAt` in the past.
- **Post-conditions**: proceed TC-004-008 (finished) or TC-004-007 (ceiling).

### TC-004-007 — Freeze ceiling >24 h → release + FR-432 path
- **Traceability**: FR-404, FR-432 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (24h − ε / 24h), ST
- **Pre-conditions**: staging-only: set `MAX_CONFIRMING_FREEZE` clock override or inject callback `confirming` at T−25 h (DB `holdFrozenAt` backdated by [DB] access), then run sweeper.
- **Steps**:
  1. Create prepaid hold, fire `confirming` webhook, backdate `holdFrozenAt` to 25 h ago.
  2. Trigger deadline sweeper (`POST /api/dev/sweep` staging helper or wait for cron).
  3. Check staff TG alert queue and DB refund-request record.
- **Expected**: slot released (available), booking → resolution path, staff alert text contains `Требуется решение` + SLA countdown ≤24 h; refund request row created.
- **Post-conditions**: resolve task manually in admin.

### TC-004-008 — PREPAID: gateway `finished` → CONFIRMED
- **Traceability**: FR-403, FR-406 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: [CRYPTO] TC-004-006 booking in frozen `confirming`.
- **Steps**:
  1. In sandbox complete the payment (or fire `finished` webhook with valid HMAC).
  2. Check client TG; open staff card; GET slots.
- **Expected**: client message `Оплата получена, запись подтверждена`; staff card `Подтверждено`; slot unavailable; DB status `BOOKED`.
- **Post-conditions**: confirmed booking (keep for refund cases).

### TC-004-009 — UNDERPAID: `partially_paid` → human resolution, no auto-confirm
- **Traceability**: FR-403, FR-432 (12 h SLA) · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: DT, NEG
- **Pre-conditions**: [CRYPTO] prepaid booking in `PAYMENT_PENDING`.
- **Steps**:
  1. Fire sandbox `partially_paid` webhook with `actually_paid` = 99% of invoice (e.g. paid 2475.00 of 2500.00).
  2. Check client TG, staff TG, admin booking list.
  3. GET slots for the booked slot.
- **Expected**: booking status `UNDERPAID` (staff card text `Недоплата`); staff alert with 12 h countdown; client message offers `доплатить или отменить`; slot remains blocked; no auto-confirmation (status ≠ `BOOKED`).
- **Post-conditions**: resolve via admin (cancel → refund per policy).

### TC-004-010 — FR-444: terminal payment on expired hold, slot still FREE → atomic re-confirm
- **Traceability**: FR-444 · **Tier**: Regression · **Priority**: P1 · **Type**: Positive · **Technique**: DT
- **Pre-conditions**: [CRYPTO] prepaid hold expired unpaid (TC-004-005 path); slot NOT re-booked.
- **Steps**:
  1. Fire sandbox `finished` webhook for the expired invoice (sandbox "late finish" or replay).
  2. Check booking status, client TG, slot state.
- **Expected**: booking CONFIRMED atomically (status `BOOKED`); NO staff resolution task; client message is a normal confirmation; no refund request row.

### TC-004-011 — FR-432: terminal payment after re-book → 2nd booking stands
- **Traceability**: FR-432 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: DT, ST
- **Pre-conditions**: [CRYPTO][DB] expired hold invoice; second client `@client_b` booked the same slot and paid (CONFIRMED).
- **Steps**:
  1. Fire `finished` webhook for the FIRST (expired) invoice.
  2. Check DB: first booking status, refund-request row, staff task row.
  3. Check both clients' TG chats; check admin staff-task SLA display.
- **Expected**: first booking `PAID_REQUIRES_RESOLUTION`; second booking untouched (`BOOKED`); refund request row exists with 24 h SLA; late payer message text contains `слот уже занят, инициирован возврат`; staff alert present. Zero automatic cancellation of the second booking.
- **Post-conditions**: resolve staff task manually.

### TC-004-012 — Crypto sandbox underpaid real amount (<99%) [CRYPTO, NEG]
- **Traceability**: FR-403 (UNDERPAID branch), FR-405 · **Tier**: Extended · **Priority**: P2 · **Type**: Negative · **Technique**: BVA (99% threshold)
- **Pre-conditions**: staging wired to NowPayments sandbox with a real invoice.
- **Test Data**: invoice 2500.00; pay sandbox amounts: 2500.00 (100%), 2499.99 (<100%), 2475.00 (99%).
- **Steps**:
  1. Pay exactly 2500.00 → expect CONFIRMED.
  2. New booking; pay 2475.00 (99.0%) → expect CONFIRMED or UNDERPAID per provider sandbox threshold (record observed).
  3. New booking; pay 2474.99 → expect UNDERPAID path (TC-004-009 expectations).
- **Expected**: boundary documented deterministically after run; ≥ the 99% boundary resolves as confirmed, below goes UNDERPAID. Store observed sandbox verdicts in this file's defect/notes section.
- **Post-conditions**: cleanup bookings.

### TC-004-013 — Refund on prepaid cancellation within window [CRYPTO]
- **Traceability**: FR-430 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: DT
- **Pre-conditions**: confirmed prepaid booking (TC-004-008), `cancellationCutoffHours` = 2 on item; now ≥ 2 h before start.
- **Steps**:
  1. Client cancels via bot `Мои записи` → `Отменить` → confirm.
  2. Check DB RefundOperation row; staff TG; client TG.
- **Expected**: refund workflow recorded (row exists, `slaHours=24`); staff card shows amount rule incl. network-fee note (fiat-equivalent at payment time); client message `Отменено, возврат инициирован`; slot available again.

### TC-004-014 — Cancellation outside window → forfeiture
- **Traceability**: FR-430 · **Tier**: Regression · **Priority**: P2 · **Type**: Negative · **Technique**: DT
- **Pre-conditions**: confirmed prepaid booking; start − now < `cancellationCutoffHours` (backdate start by [DB] if needed).
- **Steps**: client cancels via bot token flow; inspect client message and DB.
- **Expected**: client message states deposit/prepayment forfeited per policy (`Возврат не производится`); NO RefundOperation row; slot released.

### TC-004-015 — Multi-currency minor units (JPY 0 / KWD 3) — ×100 regression
- **Traceability**: FR-405 · **Tier**: Regression · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA (scale 0/2/3)
- **Pre-conditions**: [DB] staging ShopSettings currency switchable; JPY and KWD invoices created via sandbox stub.
- **Test Data**: JPY amount `1000` (scale 0 → display `¥1,000`); KWD amount `1250` (scale 3 → display `KWD 1.250`).
- **Steps**:
  1. Create invoice for JPY 1000 via sandbox; read `amountMinor` in DB and UI display.
  2. Repeat with KWD 1.250.
  3. `grep -rn "× 100\|\* 100" lib/payments/ lib/kernel/` (code regression probe).
- **Expected**: JPY stored/displayed as 1000 (no 100000), KWD as 1250 minor / `1.250` displayed; grep returns zero payment-path hits (T114 disposal).

### TC-004-016 — Webhook replay ×100 idempotency
- **Traceability**: FR-406, NFR-407 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: EG
- **Pre-conditions**: one captured valid `finished` webhook payload (HMAC valid) for a booking not yet confirmed.
- **Steps**:
  1. `for i in $(seq 1 100); do curl -X POST SHOP_URL/api/payments/nowpayments/webhook -d "$PAYLOAD" -H "$SIG"; done`
  2. Check DB: booking status, RefundOperation/notification rows, delivery log.
- **Expected**: all 100 responses processed (2xx), exactly ONE confirmation side effect: status `BOOKED` once, exactly 1 client confirmation in delivery log, zero duplicate rows.

### TC-004-017 — Webhook invalid signature → 401
- **Traceability**: FR-406 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: NEG
- **Steps**: POST the captured payload with a corrupted HMAC header to the webhook URL.
- **Expected**: HTTP `401`; booking state unchanged; security log row (no stack trace leak).

### TC-004-018 — Zero-provider mode: booking works end to end
- **Traceability**: FR-401 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: DT (provider column empty)
- **Pre-conditions**: env `PAYMENT_PROVIDERS` unset (zero-provider mode).
- **Steps**: repeat TC-004-001; additionally open Mini App checkout for any service.
- **Expected**: booking completes via hold/staff semantics identical to 003; NO payment button rendered; `isZeroProviderMode()` true path — no invoice rows created.

## US2 — Calendar & Notifications

### TC-004-019 — DST-correct slot math (Europe/Berlin)
- **Traceability**: FR-408 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: DT, BND
- **Pre-conditions**: [DB] ShopSettings `timeZone='Europe/Berlin'`; business hours 09:00–18:00 wall clock; DST spring-forward date 2027-03-28 (02:59→03:00 CET→CEST) and stable date 2027-06-15.
- **Steps**:
  1. GET `SHOP_URL/api/booking/slots?serviceId=1&date=2027-03-28`.
  2. GET same for `2027-06-15`.
  3. Compare each offered slot's UTC offset: convert one returned start on both dates.
- **Expected**: both days offer wall-clock 09:00–18:00 grid; 2027-03-28 slot 09:00 = `07:00Z` (CEST, +2), 2027-06-15 slot 09:00 = `07:00Z` too; winter probe 2027-01-15 09:00 = `08:00Z` (+1). No shifted/duplicate hour.
- **Post-conditions**: restore original timeZone.

### TC-004-020 — unavailableReason booked/break display
- **Traceability**: FR-408 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Pre-conditions**: one existing booking at 11:00 and a staff break 13:00–14:00 (or buffer) on target date.
- **Steps**:
  1. GET `SHOP_URL/api/booking/slots?serviceId=1&date=<d>&includeUnavailable=1`.
  2. Open Mini App slot grid for the same date.
- **Expected**: API `unavailable[]` contains `11:00` with `reason:"booked"` and `13:00` with `reason:"break"`; UI shows explanatory hint per blocked slot (text `занято` / `перерыв`), not silent hiding.

### TC-004-021 — TG send failure → email fallback ≤5 min, delivery log rows [TG]
- **Traceability**: FR-409, NFR-403 · **Tier**: Regression · **Priority**: P0 · **Type**: Negative · **Technique**: NEG, DT
- **Pre-conditions**: `@client_a` has email `client.a@test.dev` on file; staging TG bot token temporarily revoked OR sandbox adapter forced-fail.
- **Steps**:
  1. Create a booking for `@client_a` while TG delivery fails.
  2. Poll DB `NotificationDeliveryLog` for that booking event at +30 s, +2 min, +5:30 min.
  3. Check inbox of `client.a@test.dev` (Resend sandbox/test address).
- **Expected**: log row 1: channel `TELEGRAM`, status `FAILED`; row 2: channel `EMAIL`, status `ACCEPTED` within 5 min; email arrives with localized subject.

### TC-004-022 — No email on file → FAILED / NO_EMAIL_CHANNEL + staff warning
- **Traceability**: FR-409 · **Tier**: Regression · **Priority**: P1 · **Type**: Negative · **Technique**: NEG
- **Pre-conditions**: `@client_b` (no email), TG delivery forced-fail (as TC-004-021).
- **Steps**: create booking for `@client_b`; inspect delivery log + staff TG.
- **Expected**: exactly one log row status `FAILED` with reason `NO_EMAIL_CHANNEL` (no email attempt row); staff sees undeliverable warning card; no retry storm (≤ configured attempts).

### TC-004-023 — Staff delivery-history view
- **Traceability**: FR-409 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Steps**: as `owner@test` open a booking in `/admin/bookings` → delivery history section.
- **Expected**: every attempt listed with channel, status `accepted`/`failed` (never `delivered`), timestamp; target shown as salted hash, NOT raw contact.

### TC-004-024 — Word-month dates across surfaces
- **Traceability**: FR-410 · **Tier**: Sanity · **Priority**: P2 · **Type**: Positive · **Technique**: EP
- **Steps**: set locale ru; open Mini App slot header, client-bot confirmation, staff-bot card, email confirmation, admin bookings list for 2027-03-05.
- **Expected**: all render `5 марта` (en: `March 5`) — no `03/04`-style numeric ambiguity anywhere.

## US3 — i18n

### TC-004-025 — LocaleSwitcher ru/en via cookie + explicit override
- **Traceability**: FR-411, FR-412 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: DT
- **Steps**:
  1. Fresh incognito session → open `SHOP_URL` → observe default (instance `en`).
  2. Tap LocaleSwitcher → `Русский`.
  3. Check browser cookies (`NEXT_LOCALE` / UserPreference after TG identify).
- **Expected**: chrome switches to `ru` immediately (header, nav, buttons); cookie `NEXT_LOCALE=ru` set; after the same user opens the bot, bot renders ru too (shared UserPreference override).

### TC-004-026 — Unsupported `language_code: de` → instance default, no error
- **Traceability**: FR-412 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: EP
- **Pre-conditions**: TG client profile language German (or stubbed `from.language_code='de'` webhook).
- **Steps**: send `/start` to test bot from de-profile client; also request `SHOP_URL` with `NEXT_LOCALE=de` cookie manually.
- **Expected**: bot and web render in instance default (en); HTTP 200; no error screen, no raw key like `nav.catalog` visible.

### TC-004-027 — ICU plurals 1/2/5 слотов
- **Traceability**: FR-413 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (1, 2, 5, 21)
- **Pre-conditions**: a day with exactly 1 free slot, then 2, then 5 (manipulate bookings).
- **Steps**: view free-slots counter line in Mini App grid header in ru, then en.
- **Expected**: ru: `1 свободный слот` / `2 свободных слота` / `5 свободных слотов` / `21 свободный слот`; en: `1 free slot` / `2 free slots` / `5 free slots`. No `слотов(ов)` artifacts.

### TC-004-028 — Content stays authored language
- **Traceability**: FR-414 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Pre-conditions**: service titled `Стрижка машинкой` authored in ru; UI locale switched to en.
- **Steps**: open catalog list and item page in en.
- **Expected**: chrome (`Book now`, nav) is English; item title/description remain `Стрижка машинкой` — not translated, not blank.

### TC-004-029 — UserPreference override shared across bot and web
- **Traceability**: FR-412 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: DT
- **Steps**: 1) In bot `/language` → English. 2) Open Mini App as the same TG user. 3) Switch back to ru on web; send `/start` in bot.
- **Expected**: Mini App renders en (profile override wins over instance default); after web switch to ru, bot renders ru at next message. No restart needed.

### TC-004-030 — Email templates localized
- **Traceability**: FR-411, FR-412 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: EP
- **Pre-conditions**: `@client_a` locale ru; TG forced-fail (TC-004-021 setup).
- **Steps**: trigger booking confirmation; open received email.
- **Expected**: email body/subject in ru (`Запись подтверждена`), HTML-escaped (create booking with name `<b>test</b>` — literal shown, not bolded).

## US4 — Hybrid Telegram

### TC-004-031 — Persistent menu button opens Mini App [TG]
- **Traceability**: FR-415 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: EP
- **Steps**: open fresh chat with `@undre_test_bot` → observe chat menu button (bottom-left attached button) → tap it.
- **Expected**: Mini App storefront opens (catalog visible) without typing `/start`; button persists after bot restart (set on init).

### TC-004-032 — Quick actions ≤3 taps: my bookings / cancel / language [TG]
- **Traceability**: FR-416 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: DT (tap-count table)
- **Pre-conditions**: `@client_a` has ≥1 confirmed booking.
- **Steps**:
  1. Open bot menu → tap `Мои записи` (tap 2) → booking list shown.
  2. Tap a booking (tap 3) → cancel button visible; tap `Отменить` → confirm.
  3. Menu → `Язык` (tap 2) → `English` (tap 3).
- **Expected**: each journey completes within 3 taps from menu open; cancellation succeeds (status `CANCELLED`, slot freed); language applies at next render.

### TC-004-033 — themeParams light/dark flip
- **Traceability**: FR-417, FR-431 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: DT
- **Steps**: 1) Set TG client theme light → open Mini App → screenshot. 2) Switch to dark → reopen → screenshot. 3) Compare backgrounds.
- **Expected**: Mini App background/text follow client theme both times (`data-theme="undrlla"` vs `undrlla-dark` observable in DOM); no forced dark when client is light; no unreadable contrast.

### TC-004-034 — tg:// deep link with startapp context
- **Traceability**: FR-418 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Pre-conditions**: a published professional profile page at `/professionals/<slug>`.
- **Steps**: 1) Open the profile in a desktop browser. 2) Click the Telegram CTA button. 3) In the opened bot chat, tap the inline/webapp button.
- **Expected**: `href` matches `tg://…?startapp=<professionalId-context>`; bot/Mini App opens showing that professional's context (name matches clicked profile).

### TC-004-035 — Cancel via bot token flow (no Mini App exit)
- **Traceability**: FR-416 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: ST
- **Steps**: bot `Мои записи` → booking → `Отменить` → `Подтвердить отмену`; check slots API.
- **Expected**: cancellation completes inside chat; status `CANCELLED`; freed slot immediately bookable via API.

## US9 — Content Administration

### TC-004-036 — Staff web login happy path
- **Traceability**: T017/T018 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: EP
- **Steps**: 1) Open `SHOP_URL/admin/login` at 390×844 viewport. 2) Type `owner@test` / `St4ff!Pass1`. 3) Submit.
- **Expected**: redirect to `/admin/catalog`; session cookie `HttpOnly`/`Secure` present; previous session id invalidated (rotation).

### TC-004-037 — Lockout: 5 wrong passwords → 15-minute lockout [BND]
- **Traceability**: FR-427 · **Tier**: Smoke · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA 7-point (1, 4, 5, 6 attempts)
- **Test Data**: login `owner@test`, wrong password `WrongPass1`.
- **Steps**:
  1. Attempt 1–4 with wrong password → expect `401` each.
  2. Attempt 5 wrong → expect `401` + lockout event.
  3. Attempt 6 with CORRECT password `St4ff!Pass1` → expect `423`/`401` lockout response (not success).
  4. Check staff-visible event (audit/notice).
  5. At +15:01 min login with correct password.
- **Expected**: attempts 1–4 `401`; attempt 5 triggers 15-min lock; attempt 6 rejected while locked with lockout message; staff-visible lockout event exists; +15:01 login succeeds → redirect `/admin/catalog`.
- **Post-conditions**: none.

### TC-004-038 — RBAC: OPERATOR blocked from foundation settings
- **Traceability**: FR-438 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: DT (role × endpoint matrix)
- **Steps**: 1) Login as `operator@test` → open `/admin/settings` → foundation section visibility. 2) Direct API: `PATCH /api/admin/settings` body `{"timeZone":"UTC"}` with operator session.
- **Expected**: UI hides/disables foundation fields (currency, timezone, defaultLocale, payouts); API returns `403`; settings unchanged (GET confirms old `timeZone`).

### TC-004-039 — RBAC: PERFORMER has no catalog management
- **Traceability**: FR-436/438 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: DT
- **Steps**: login as `performer@test` → navigate to `/admin/catalog`; direct `POST /api/admin/items` with valid service payload.
- **Expected**: UI shows no catalog tab (or read-only own profile only); API `403`; zero rows created.

### TC-004-040 — Quick-create ≤4 fields, ≤2 taps depth, ≤10 min setup [R2]
- **Traceability**: FR-439, FR-436 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: EX (timed charter)
- **Steps** (390px viewport, stopwatch from login):
  1. `/admin/catalog` → tap `+` (tap 2) → sheet opens with exactly 4 required fields: title, price, duration, master.
  2. Fill: `Массаж спины` / `3000` / `45 мин` (selector) / `Все мастера`. Verify no free-form duration input.
  3. Tap `Сохранить` (no upload).
  4. Open storefront → find the new service.
- **Expected**: sheet has exactly 4 required inputs + collapsed `Ещё` for advanced; save ≤2 taps depth; storefront lists `Массаж спины` immediately; 45-min duration accepted on grid (30-grid start interval, off-grid end allowed per FR-442). Total ≤10 min including product+profile (run full quickstart charter).

### TC-004-041 — One-tap active toggle hides item
- **Traceability**: FR-440 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Steps**: on catalog list tap the active toggle of `Массаж спины` (without opening edit); check storefront; tap back on.
- **Expected**: item disappears from storefront after toggle-off in one tap; reappears on toggle-on; state persists after reload.

### TC-004-042 — Reorder arrows + validation parity
- **Traceability**: FR-436, FR-442 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: EP
- **Steps**: tap ↑ on the second catalog item; try quick-create with price `-1`, duration `40 мин` (not %15), title empty.
- **Expected**: order swaps and persists on reload; each invalid submit shows the API-parity zod field error (`price must be positive`, `duration must be a multiple of 15`, `title required`); no row created.

### TC-004-043 — ImageUploader: oversize/oversize-after-compress & type rejection
- **Traceability**: FR-441 · **Tier**: Sanity · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA
- **Test Data**: `cat.jpg` (5 MB JPEG), `doc.pdf`, `tiny.webp` (<1 KB), HEIC photo from phone.
- **Steps**: attach each file in the profile image uploader; observe client-side errors before any network PUT.
- **Expected**: `doc.pdf` rejected client-side with field error `Файл должен быть изображением` (no presign request in devtools); JPEG/HEIC auto-compressed to WebP ≤200 KB ≤1200 px then uploaded; after compression >5 MB impossible (client ceiling) — if forced via devtools PUT with `contentLength>5242880`, presign/API rejects (see TC-004-068).

### TC-004-044 — Presign → direct PUT happy path [R2]
- **Traceability**: FR-441 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Steps**: upload `cat.jpg` (5 MB) to profile image; watch network tab: `POST /api/admin/uploads/presign` then `PUT` to R2 URL; then save profile.
- **Expected**: presign response `{url, key, expiresIn: 300}`; PUT goes **directly to R2 host** (not the app origin); image renders on public profile; server process memory flat (no buffering — check RSS log optional).

### TC-004-045 — Upload-infrastructure outage does not block save [R2]
- **Traceability**: FR-441 · **Tier**: Regression · **Priority**: P2 · **Type**: Negative · **Technique**: NEG
- **Steps**: block R2 (bad credentials in staging env) → attempt image upload (fails) → fill title/price → `Сохранить`.
- **Expected**: image error shown as non-blocking warning; item saves with no image; attaching the image later via retry succeeds when R2 restored.

### TC-004-046 — Slug rename → 301
- **Traceability**: FR-437 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: ST
- **Pre-conditions**: profile with slug `anna-old`, public page indexed.
- **Steps**: 1) `curl -sI SHOP_URL/professionals/anna-old` (baseline 200). 2) In `/admin/team` rename slug to `anna-new`, save. 3) `curl -sI` old URL and new URL; unpublish profile → `curl -sI` again.
- **Expected**: old slug returns `301` → `Location: /professionals/anna-new`; new returns `200`; after unpublish both return `404` and profile leaves listings.

### TC-004-047 — Currency confirm gate (OWNER)
- **Traceability**: FR-438 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP
- **Steps**: as `owner@test` in `/admin/settings` foundation → change currency `RUB`→`USD` → observe dialog → confirm → save; then cancel flow (dismiss).
- **Expected**: explicit confirmation dialog before applying (no silent change); after confirm, storefront prices re-render in USD; dismissed flow leaves currency unchanged.

### TC-004-048 — Draft persistence across app switch
- **Traceability**: FR-443 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: EG
- **Steps**: 1) Open quick-create, fill `Массаж` + `3000` (do NOT save). 2) Switch to another mobile app / background tab for 30 s. 3) Return to the admin tab.
- **Expected**: form still holds `Массаж`/`3000` (local draft); explicit save still required — price field never auto-saved on blur (storefront has no half-created item).

## US5 — Waitlist & Any-Available

### TC-004-049 — Waitlist join happy path + contact-only rejection
- **Traceability**: FR-419 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: EP, NEG
- **Steps**: 1) As `@client_a` (TG-identified) open fully-booked day grid → tap `В лист ожидания` → choose service `Стрижка`, window `next 7 days`. 2) Attempt join from a non-TG session (API `POST /api/waitlist` without TG identity). 3) Check `WaitlistEntry` row.
- **Expected**: step 1 join succeeds with confirmation message; step 2 rejected with guidance text (`вступление в лист ожидания доступно через Telegram`) — no silent dead-end.

### TC-004-050 — ACTIVE cap: 11th entry rejected [BND]
- **Traceability**: FR-419 · **Tier**: Regression · **Priority**: P1 · **Type**: Boundary · **Technique**: BVA (10, 11)
- **Steps**: create 10 ACTIVE waitlist entries for `@client_a` (different services/windows via API as the TG user); attempt the 11th; cancel one; attempt again.
- **Expected**: 10 succeed, 11th rejected with cap message (`Максимум 10 активных записей`); after cancelling one, the 11th succeeds (cap is ACTIVE-entries, not lifetime).

### TC-004-051 — Offer anti-spam caps (1/24h, 3/day)
- **Traceability**: FR-419 · **Tier**: Regression · **Priority**: P2 · **Type**: Boundary · **Technique**: BVA
- **Pre-conditions**: [DB] `@client_a` with a waitlist entry; staged cancellations of matching slots.
- **Steps**: trigger 1st cancellation → offer arrives; trigger 2nd matching cancellation within 24 h; via [DB] backdate the offer row 25 h → trigger 3rd; trigger 4th same-UTC-day cancellation.
- **Expected**: 2nd cancellation sends NO offer to this user (1/24h cap) but slot is publicly available; after 25 h backdate the 3rd offer sends; 4th same-day offer suppressed (3/day cap). No errors thrown to other users.

### TC-004-052 — Cancel → matching offer ≤60 s
- **Traceability**: FR-420, NFR-403 · **Tier**: Smoke · **Priority**: P0 · **Type**: Positive · **Technique**: EP (timing)
- **Steps**: 1) `@client_a` joins waitlist for `Стрижка` window next 7 days. 2) `@client_b` books then cancels the matching slot. 3) Stop timer at `@client_a`'s TG offer message.
- **Expected**: offer inline message (with claim button) arrives ≤60 s; freed slot is ALREADY publicly bookable via API during the offer window (notification priority, not reservation); offer wording contains `если ещё свободно`.

### TC-004-053 — Two concurrent claims → single winner [BND]
- **Traceability**: FR-420 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: EG (race)
- **Pre-conditions**: one live offer each to `@client_a` and `@client_b` for the same freed slot.
- **Steps**: both clients tap `Забрать` within the same second (manual simultaneous tap, or scripted `curl` with both offer tokens fired in parallel).
- **Expected**: exactly ONE booking created (winner's status HELD/CONFIRMED); loser gets definitive `уже занято` (HTTP 409 or TG text) — no partial state, slot not double-booked (verify `Reservation` count for slot = 1 active).

### TC-004-054 — Unclaimed offer expires silently
- **Traceability**: FR-433 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: BND (TTL 1 h)
- **Steps**: leave an offer unclaimed for 1 h+; check `WaitlistOffer` status and slot state; no client-side notification expected.
- **Expected**: offer marked expired; slot remains free for public booking; NO "offer expired" push to the customer (silent); entry stays ACTIVE (not FULFILLED).

### TC-004-055 — Prepaid claim abandoned → re-fan-out excluding abandoner, ≤3 waves
- **Traceability**: FR-433 · **Tier**: Regression · **Priority**: P2 · **Type**: Negative · **Technique**: ST
- **Pre-conditions**: [DB] prepaid service waitlist entries `@client_a` (claimed, held) and `@client_b` (waiting).
- **Steps**: 1) `@client_a` claims prepaid offer → HELD created (entry NOT fulfilled). 2) Let the hold expire unpaid. 3) Observe next offer wave.
- **Expected**: after expiry `@client_b` receives the re-fan-out offer; `@client_a` excluded (no new offer within 24 h anyway); after 3 waves (or 24 h) no further offers for that slot — it just stays public.
- **Post-conditions**: verify `WaitlistEntry` FULFILLED only when claimed booking reaches CONFIRMED (pay in sandbox → entry becomes FULFILLED).

### TC-004-056 — Any-available ranking: history > soonest [BND]
- **Traceability**: FR-421 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: DT
- **Pre-conditions**: `@client_a` has history with master `Anna`; tomorrow: `Anna` free at 16:00, master `Bob` free at 10:00.
- **Steps**: book `Стрижка` choosing `Любой мастер`; inspect proposed ordering.
- **Expected**: first proposal = Anna 16:00 (same-performer history outranks sooner stranger Bob 10:00); deterministic on reload (same order); gap-penalty visible when two same-rank options exist (packed calendar preferred).

### TC-004-057 — Admin waitlist outcome counters
- **Traceability**: FR-422 · **Tier**: Regression · **Priority**: P3 · **Type**: Positive · **Technique**: EP
- **Steps**: run TC-004-052/053; open admin waitlist section.
- **Expected**: counters show offers sent (+N) and slots recovered per period matching the executed cases.

## US6 — Custom Booking Fields

### TC-004-058 — 4 field types + required blocks booking [BND]
- **Traceability**: FR-423, FR-424 · **Tier**: Sanity · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA (limits), EP (types)
- **Pre-conditions**: owner defines via admin field editor: `Комментарий` (text, ≤1000), `Этаж` (number, 1–25), `Тип массажа` (select: `Классический|Спортивный`), `Нужен полотенце?` (checkbox), all bound to `Массаж спины`, `Комментарий`+`Этаж` required.
- **Test Data**: text 1000 chars (valid), 1001 chars (invalid); number 1/25/0/26.
- **Steps**: 1) Book `Массаж спины` leaving required fields empty → submit. 2) Fill `Комментарий` with 1001 chars → submit. 3) Fill 1000 chars, `Этаж=26` → submit. 4) Valid set (1000 chars, этаж 1, select, checkbox on) → submit. 5) Staff opens the booking.
- **Expected**: step 1 blocked with per-field required errors; step 2 error `Максимум 1000 символов`; step 3 error `Допустимо 1–25`; step 4 booking created, answers persisted; step 5 staff sees all 4 answers sanitized; anonymous/performer session sees none.

### TC-004-059 — Injection & payload bound sanitization [NEG]
- **Traceability**: FR-434 · **Tier**: Regression · **Priority**: P1 · **Type**: Negative · **Technique**: EG
- **Test Data**: answer text `<script>alert(1)</script>`, answer `" OR 1=1 --`, total payload 33 KB JSON body.
- **Steps**: create booking with these answers via API; open staff view.
- **Expected**: staff UI renders payload as escaped literal text (no execution); API rejects >32 KB body with `413`/`400` cap error; booking rows show sanitized values.

### TC-004-060 — Archive keeps historical answers
- **Traceability**: FR-423 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: ST
- **Steps**: 1) Create booking with answered field `Этаж=5`. 2) Owner archives (deactivates) the field in admin editor (no hard-delete button anywhere). 3) New booking form → field gone. 4) Open the OLD booking as staff.
- **Expected**: step 2 archive-only (definition row persists, `archivedAt` set); step 3 field not rendered for new bookings; step 4 old booking shows `Этаж: 5` with definition snapshot label — history intact.

## US7 — Privacy & Abuse Hardening

### TC-004-061 — OUT_CALL without address → 400 field error
- **Traceability**: FR-425 · **Tier**: Smoke · **Priority**: P0 · **Type**: Negative · **Technique**: NEG
- **Steps**: `POST /api/booking` body `{"serviceId":2,"slot":"<ts>","customerContact":"+79001112233"}` (no `address`); repeat from Mini App UI leaving address empty.
- **Expected**: HTTP `400` with field-level error payload pointing at `address` (e.g. `{"errors":{"address":"Адрес обязателен для выезда"}}`); UI shows the same message under the address input; no reservation row created.

### TC-004-062 — Mixed cart blocked with split guidance
- **Traceability**: FR-426 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: NEG
- **Steps**: build cart: service `Стрижка` + product `Масло` → submit checkout (UI) and via `POST /api/checkout`.
- **Expected**: HTTP `400` / UI error text guides to two separate orders (`Оформите услуги и товары отдельными заказами`); no order row; authoritative server-side (works from stale client too).

### TC-004-063 — Rate limit: 11th booking in a minute → 429 [BND]
- **Traceability**: FR-427 · **Tier**: Smoke · **Priority**: P0 · **Type**: Boundary · **Technique**: BVA (10, 11)
- **Test Data**: contact `+79009998877`, free slots ×12.
- **Steps**: `for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code}\n" -X POST SHOP_URL/api/booking -d '{"serviceId":1,"slot":"<slot-i>","customerContact":"+79009998877"}' -H "Content-Type: application/json"; done`
- **Expected**: requests 1–10 → `200`/`201`; request 11 → `429` with body `{"error":"Too many booking attempts. Please try again later."}`; slot states consistent (exactly 10 reservations, no corruption); retry hint header/body per limiter.

### TC-004-064 — Staff-bot confirm barrier: 2 presses, 30 s
- **Traceability**: FR-429 · **Tier**: Sanity · **Priority**: P1 · **Type**: Positive · **Technique**: BND
- **Steps**: 1) Staff presses `Отклонить` on a booking card once. 2) Wait 35 s. 3) Press `Отклонить` again. 4) Repeat press-press within 10 s.
- **Expected**: single press does NOT reject — bot shows confirmation prompt (`showAlert`) with 30 s validity; step 2–3 after 35 s the prompt expired (must start over, nothing rejected); step 4 second press within 30 s completes the rejection.
- **Post-conditions**: booking `STAFF_REJECTED`, client notified per policy.

### TC-004-065 — Rejection notification policy modes
- **Traceability**: FR-429 · **Tier**: Regression · **Priority**: P2 · **Type**: Positive · **Technique**: DT (3 modes)
- **Pre-conditions**: `STAFF_REJECT_NOTIFY_MODE` settable by owner (env/admin) to `AUTO_MESSAGE` / `ALTERNATIVE_OFFER` / `MANUAL`.
- **Steps**: for each mode, staff rejects a pending booking; observe client chat + delivery log.
- **Expected**: AUTO_MESSAGE → instant client text; ALTERNATIVE_OFFER → client gets alternative slot suggestion; MANUAL → no auto client message (staff follow-up task); each attempt in delivery log.

### TC-004-066 — PII redaction + retention purge visibility
- **Traceability**: FR-428, SC-403, NFR-404 · **Tier**: Sanity · **Priority**: P1 · **Type**: Negative · **Technique**: EG
- **Steps**: 1) Staff writes audit reason containing a phone `+79001112233` (any mutation with note); 2) inspect persisted `AuditEvent.reason`; 3) run nightlyPurge staging helper on a backdated completed booking with `serviceAddressSnapshot`; 4) run the zero-PII log-scan.
- **Expected**: persisted reason shows redacted/masked phone (not the raw number); snapshot column NULL after purge; automated scan reports zero PII occurrences.

### TC-004-067 — DR drill real restore (RTO/RPO)
- **Traceability**: NFR-405 · **Tier**: Extended · **Priority**: P1 · **Type**: Positive · **Technique**: EX (ops drill)
- **Steps**: on staging run `pwsh scripts/dr-restore-drill.ps1` (pg_restore of latest backup into scratch DB); record measured RTO/RPO output.
- **Expected**: drill performs an ACTUAL restore; verifies settings/items/staff/bookings/waitlist rows; prints measured RTO ≤60 min and RPO ≤24 h with evidence — PASS verdict written to evidence file (retires the 003 fake stub).

### TC-004-068 — Presign abuse probes [R2]
- **Traceability**: FR-441, FR-427 · **Tier**: Regression · **Priority**: P1 · **Type**: Negative · **Technique**: BVA (5 MB, TTL 5 min), NEG
- **Test Data**: presign request with `contentLength=5242881` (5 MB+1); valid presign then PUT after 6 min; PUT with wrong content-type; `PERFORMER` session request.
- **Steps**: call `POST /api/admin/uploads/presign` per case; attempt PUTs accordingly.
- **Expected**: oversized → `400` validation error (`Invalid content length (1..5242880 bytes)`); expired PUT → R2 `403 SignatureDoesNotMatch/expired`; wrong content-type → `403` (signed conditions); performer → `403`; >30 presigns per 5 min from one actor → `429`.

## US8 — Design System (charter probes)

### TC-004-069 — Token gate: zero raw hex / generic palette
- **Traceability**: FR-431 · **Tier**: Regression · **Priority**: P2 · **Type**: Negative · **Technique**: EG (static)
- **Steps**: run `node scripts/design-token-gate.mjs`; manually inspect one storefront + admin screen devtools for `bg-gray-*`/raw `#` in brand/semantic roles.
- **Expected**: gate PASS (exit 0); manual probe finds only `base-*`/brand tokens.

### TC-004-070 — Both themes flip consistently
- **Traceability**: FR-431 · **Tier**: Sanity · **Priority**: P2 · **Type**: Positive · **Technique**: EX (visual pass)
- **Steps**: walk storefront → item → checkout → professional page → admin → bot keyboards → email in `undrlla` and `undrlla-dark`.
- **Expected**: all surfaces flip; semantic colors (error/warning) readable in both; no half-flipped component.

### TC-004-071 — i18n coverage gate (automated)
- **Traceability**: FR-411, NFR-406 · **Tier**: Regression · **Priority**: P2 · **Type**: Negative · **Technique**: static gate
- **Steps**: run `node scripts/i18n-coverage-gate.mjs`; then add a temp key used in code but missing from `uk` dictionary and re-run.
- **Expected**: baseline PASS; missing-locale run FAILS with key list (uk addable data-only, no code diff).

### TC-004-072 — Exploratory charter: money-calendar race weekend (US1)
- **Traceability**: FR-403/404/406/420 · **Tier**: Extended · **Priority**: P1 · **Type**: Exploratory · **Technique**: EX, 60-min timebox
- **Charter**: "Probe the boundary between payment timing and slot ownership." Interleave: pay-at-TTL-ε, hold-freeze vs sweeper, webhook storms (random order, duplicated, out-of-order `confirming→finished→partially_paid`), waitlist claim racing a storefront booking on the same freed slot. Log any state where money and calendar disagree (double-booking, orphan payment, ghost hold) as defect with repro.

### TC-004-073 — Exploratory charter: thin-controller & RBAC sweep (US9/US7)
- **Traceability**: FR-435, FR-438 · **Tier**: Extended · **Priority**: P2 · **Type**: Exploratory · **Technique**: EX, 45-min timebox
- **Charter**: "Every admin route × every role." For each `/api/admin/*` endpoint fire OWNER/OPERATOR/PERFORMER/anonymous sessions; flag any business logic executed in route handlers beyond validation+service call, and any role reaching foundation settings or other performers' profiles.

---

## Count summary

- **Total TCs**: 73 (TC-004-001..073).
- **By tier**: Smoke 20 · Sanity 26 · Regression 22 · Extended 5.
- **By type**: negative/boundary/exploratory = 33/73 ≈ **45%** (≥40% requirement met).
- **Techniques**: ST (state transition) 10 · DT (decision table) 15 · BVA (1/2/3/5/7-point) 14 · EP 16 · NEG 12 · EG (error guessing) 6 · EX (exploratory charters/drills) 5.
- **Environment prerequisites**: [CRYPTO] TC-004-004..014 (sandbox), [TG] 021/022/031/032/049/052/053 (test bot + accounts), [R2] 040/043/044/045/068 (test bucket), [DB] 007/011/015/019/051/055 (read-only or seeded staging DB access).
