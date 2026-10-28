# UAT Scenarios — 004-release-readiness

> Business acceptance scenarios; each executed by the named persona on staging with production-like seed data. Business Sign-off recorded per scenario — **all [PENDING]** until staging UAT session.

---

### UAT-1 — Zero to first booking: shop set up on a phone in ≤10 minutes
- **Target Persona**: solo beauty-business OWNER (non-developer, phone only, 390×844 viewport).
- **Business Goal**: a new white-label instance goes from empty to a bookable storefront without developer help (US9 + quickstart; US9-SC bar).
- **Success Criteria** (≤3, measurable):
  1. Working storefront (≥1 service with price/duration/master/photo, ≥1 profile, currency+timezone set) — stopwatch ≤ 10 min from first login.
  2. Zero developer/API interactions (screenshot the whole session).
  3. A real client booking made against the created content completes successfully.
- **Validation Steps**:
  1. Open `SHOP_URL/admin/login`, sign in as OWNER.
  2. Settings: confirm currency and timezone (Europe/Berlin), save.
  3. Catalog quick-create: `Массаж спины`, 3000, 45 мин, Все мастера; upload a photo from phone gallery (HEIC) — verify compression.
  4. Team: create profile `Anna`, upload photo, publish.
  5. Open the client bot on a second phone → book the new service (any-available) → confirm.
- **Linked TCs**: TC-004-036, 040, 043, 044, 001, 056.
- **Business Sign-off**: [PENDING] — Owner name/date/result.

### UAT-2 — Prepaid crypto booking lifecycle end-to-end
- **Target Persona**: returning CLIENT with a crypto wallet; observed by OWNER.
- **Business Goal**: money and calendar never contradict — the flagship money path works without manual reconciliation (US1).
- **Success Criteria**:
  1. Book prepaid service → pay in sandbox → confirmation arrives with status `Подтверждено` and slot is blocked for others, all in ≤3 min.
  2. A second client attempting the same slot during payment is rejected with a clear "slot taken" message.
  3. Cancel within the refund window → refund request recorded and both parties notified.
- **Validation Steps**:
  1. Client books `Окрашивание` (requiresFullPrepayment) → provider invoice page opens (provider URL).
  2. Pay via crypto sandbox; watch the `confirming` → `finished` phases (staff card shows freeze, no expiry).
  3. Second client attempts the slot → rejected.
  4. Client cancels via bot within window → refund message + owner sees RefundOperation in admin.
- **Linked TCs**: TC-004-004, 006, 008, 013.
- **Business Sign-off**: [PENDING].

### UAT-3 — Cancellation recovery: a client is never lost
- **Target Persona**: CLIENT on the waitlist + front-desk OPERATOR.
- **Business Goal**: freed slots get rebooked instead of sitting empty (US5; SC-405 baseline behavior).
- **Success Criteria**:
  1. After a cancellation, matching waitlisted client receives a Telegram offer within 60 s.
  2. Two simultaneous claims produce exactly one booking, loser told "уже занято" with no error screen.
  3. Owner sees the recovered-slot counter increase by 1 in admin.
- **Validation Steps**:
  1. Client A joins waitlist for a fully-booked service/day.
  2. Client B books then cancels the same slot via bot.
  3. Both A and a second waitlisted client tap claim simultaneously.
  4. Operator checks admin waitlist counters and the resulting booking.
- **Linked TCs**: TC-004-049, 052, 053, 054, 057.
- **Business Sign-off**: [PENDING].

### UAT-4 — Russian-speaking client on an en-default instance
- **Target Persona**: CLIENT with Telegram `language_code=ru` (diaspora market).
- **Business Goal**: the core RU audience gets a native experience; language choice sticks across bot and web (US3).
- **Success Criteria**:
  1. Bot and Mini App render in Russian without any action (language_code resolution).
  2. Explicit switch to English (bot `/language`) reflects on web for the same person.
  3. Plurals and dates are correct ru forms (`1 свободный слот` / `2 свободных слота` / `5 свободных слотов`; `5 марта`); owner content stays in its authored language.
- **Validation Steps**:
  1. On an en-default instance, open bot + Mini App as a ru-profile client.
  2. Switch language in bot; reload Mini App.
  3. Book across a day with 1/2/5 slots and check counter strings; check item titles.
- **Linked TCs**: TC-004-025, 027, 028, 029, 024.
- **Business Sign-off**: [PENDING].

### UAT-5 — Staff daily routine via bots (approve/confirm/fulfill)
- **Target Persona**: OPERATOR (front desk) and PERFORMER on the staff bot.
- **Business Goal**: the whole working day runs from Telegram without the admin web UI (US1 free track + US4).
- **Success Criteria**:
  1. OUT_CALL request appears in staff bot ≤30 s and is approved in ≤2 presses with the 30 s confirm barrier.
  2. A rejection releases the slot and notifies the client per the configured policy.
  3. Delivery history answers "was the client notified?" with channel+status evidence for every event.
- **Validation Steps**:
  1. Client books OUT_CALL → operator approves in staff bot.
  2. Client books another OUT_CALL → operator rejects (barrier) → verify client message and freed slot.
  3. Operator opens delivery history for both bookings in admin.
- **Linked TCs**: TC-004-002, 064, 065, 003, 023.
- **Business Sign-off**: [PENDING].

### UAT-6 — Email fallback saves a broken-Telegram day
- **Target Persona**: OWNER (whose bot token gets revoked / Telegram outage) + CLIENT with email on file.
- **Business Goal**: notification redundancy — a client is never silently lost because Telegram is down (US2).
- **Success Criteria**:
  1. With TG delivery failing, a booking confirmation reaches the client by email within 5 minutes.
  2. A client without email on file produces a `FAILED/NO_EMAIL_CHANNEL` record and a staff warning — no silent drop.
  3. Delivery log shows both the failed TG and successful email attempts with timestamps.
- **Validation Steps**:
  1. Staging: revoke test-bot token (or force-fail adapter).
  2. Client with email books; check inbox + log within 5 min.
  3. Client without email books; check log + staff warning.
  4. Restore token; verify TG delivery resumes.
- **Linked TCs**: TC-004-021, 022, 023.
- **Business Sign-off**: [PENDING].

### UAT-7 — GDPR-relevant customer data handling visibility
- **Target Persona**: OWNER acting as data controller (GDPR market, outside RF).
- **Business Goal**: the owner can answer a data-subject request with concrete evidence (US7; SC-403).
- **Success Criteria**:
  1. An automated/manual scan of audit reasons and delivery log shows zero raw PII (phone/email/address).
  2. A simulated user deletion (or purge run) removes service address snapshots, custom answers, delivery-log rows and waitlist data for that user.
  3. Custom-field answers are visible only to authorized staff (performer sees none of another master's bookings).
- **Validation Steps**:
  1. Create bookings with PII in notes/answers; inspect audit + delivery log with the owner.
  2. Trigger the purge/GDPR deletion helper on staging; re-inspect rows.
  3. Log in as PERFORMER and attempt to view other masters' booking answers.
- **Linked TCs**: TC-004-066, 058, 059.
- **Business Sign-off**: [PENDING].

---

## UAT execution notes

- Scenarios UAT-1..UAT-7 cover US9, US1, US5, US3, US1/US4/US2, US2, US7 — all P1 stories plus hardening. US8 (design tokens) is covered by automated gates + TC-004-070 visual pass, not a separate business scenario.
- Prerequisites: staging with sandbox crypto provider, test bot + 2 client TG accounts, R2 test bucket, seed shop (see test-cases.md header).
- Record each sign-off with persona name, date, pass/fail, and linked defect IDs; store screenshots in `specs/004-release-readiness/evidence/`.
