# TC-MAIN — Consolidated Whole-App Manual Regression Suite (staging)

**Standard**: ISO/IEC/IEEE 29119-4 style case blocks. **Base URL**: `https://staging.underundre.shop` (local: `http://localhost:3000`). **Marker** `[NEG]`/`[BOUNDARY]` on the Type line. Total: **53 cases**; tagged `[NEG]`/`[BOUNDARY]`: **34 ≈ 64%** (≥40% target met).

## Global Test Data (hardcoded)

| Item | Value |
|---|---|
| Bootstrap OWNER | email `owner@qa-underundre.com`, password `QaOwner#2026!x` |
| OPERATOR invite | email `operator@qa-underundre.com`, password `QaOper#2026!y` |
| PERFORMER invite | email `performer@qa-underundre.com`, password `QaPerf#2026!z` |
| Admin break-glass token | `ADMIN_TOKEN=qa_admin_breakglass_0987654321` |
| Old (rotated) token | `qa_admin_oldtoken_rotated_1122334455` |
| Service A | slug `sovereign-architecture-audit`, 60 min, 35000 minor, currency USD, IN_CALL, no prepay |
| Service B | slug `express-code-review`, 30 min, 15000 minor, USD, IN_CALL, no prepay |
| Service C (prepaid) | slug `crypto-hardening-sprint`, 90 min, 90000 minor, USD, IN_CALL, `requiresFullPrepayment = true` |
| Service D (out-call) | slug `onsite-network-audit`, 120 min, 120000 minor, USD, OUT_CALL |
| Customer #1 | name `Иван Тестов`, phone `+79991112233`, tg id `555111` |
| Customer #2 | name `Jane Tester`, phone `+79995556677`, tg id `555112` |
| Blacklisted phone | `+79998887766` |
| Staff group | `STAFF_CHAT_ID=-1001234567890`, authorized staff tg id `777000111`, outsider tg id `999999999` |
| Secrets | `TELEGRAM_WEBHOOK_SECRET=test_telegram_secret`, `STAFF_WEBHOOK_SECRET=test_staff_webhook_secret`, `NOWPAYMENTS_IPN_SECRET=qa_ipn_secret_777` |
| Flags (cut-over state) | `FEATURE_FLAG_FSM_CUTOVER=true`, `FEATURE_FLAG_PAYMENT_PROVIDER_CUTOVER=true`, `FEATURE_FLAG_WAITLIST=true`, `FEATURE_FLAG_I18N=true`, `FEATURE_FLAG_EMAIL_FALLBACK=true` |
| Shop schedule | Mon–Fri 10:00–18:00 UTC, lunch break 13:00–14:00 UTC, `minNoticeMin=60`, `slotGridStepMin=30` |

---

## A. Authentication, RBAC & Flags

### TC-MAIN-001 — Bootstrap owner web sign-in
- **Traceability**: FR-427, StaffRole OWNER
- **Tier**: E2E-Manual | **Priority**: P0 | **Type**: Positive | **Technique**: happy path
- **Pre-conditions**: staging seeded; bootstrap OWNER exists; `FEATURE_FLAG_FSM_CUTOVER=true`
- **Test Data**: `owner@qa-underundre.com` / `QaOwner#2026!x`
- **Steps**: 1. Open `/admin/login`. 2. Enter email+password. 3. Submit.
- **Expected**: redirect to `/admin/bookings`; cookie `session_token` set (HttpOnly, Secure, SameSite); audit row `STAFF_SIGN_IN` written.
- **Post-conditions**: owner session active for TC-MAIN-004.

### TC-MAIN-002 — Wrong password ×5 → 15-min lockout [NEG]
- **Traceability**: FR-427 (lockout)
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Negative (security) | **Technique**: error guessing
- **Pre-conditions**: fresh lockout state for the account (restart server to clear in-memory registry)
- **Test Data**: email `owner@qa-underundre.com`, password `wrong-pass-1` … `wrong-pass-5`
- **Steps**: 1. Submit wrong password 4×. 2. 5th wrong attempt. 3. Correct password attempt.
- **Expected**: attempts 1–4 → `INVALID_CREDENTIALS` + audit `STAFF_SIGN_IN_FAILED`; attempt 5 → lockout engaged; attempt 6 (correct password) → still `LOCKED_OUT` with `retryAfterMs > 0` (≈15 min), no session created.
- **Post-conditions**: none (lockout expires naturally or server restarted).

### TC-MAIN-003 — Role permission matrix via invites
- **Traceability**: FR-316-lineage, StaffRole OWNER/OPERATOR/PERFORMER, `ROLE_RANK`
- **Tier**: E2E-Manual | **Priority**: P0 | **Type**: Positive + Negative | **Technique**: role matrix
- **Pre-conditions**: owner session active (TC-MAIN-001)
- **Test Data**: invite emails/passwords from Global table
- **Steps**: 1. Owner → `/admin/team`: invite `operator@qa-underundre.com` as OPERATOR and `performer@qa-underundre.com` as PERFORMER. 2. Log out; sign in as OPERATOR. 3. Open `/admin/catalog` → edit Service B price to `16000`, save. 4. Open `/admin/settings` → attempt to change currency/timezone. 5. Log out; sign in as PERFORMER. 6. Open `/admin/bookings` → view today's booking; attempt to edit Service A.
- **Expected**: 3. OPERATOR catalog edit succeeds (content allowed). 4. OPERATOR blocked from system-foundation settings (currency/timezone/language/payouts are OWNER-only) — save rejected with permission error, no DB write. 6. PERFORMER sees bookings read-only; service edit rejected. Every denial writes an audit event.
- **Post-conditions**: all three sessions created for later cases.

### TC-MAIN-004 — Session rotation kills previous sessions
- **Traceability**: FR-427 (rotation)
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Positive (security) | **Technique**: state transition
- **Pre-conditions**: PERFORMER session active in browser 1
- **Steps**: 1. In browser 2, sign in as `performer@qa-underundre.com` again. 2. In browser 1, reload `/admin/bookings`.
- **Expected**: browser 1 session invalidated (all `Session` rows for the user were `deleteMany`'d at re-login) → redirect to `/admin/login`; exactly one active session row in DB.
- **Post-conditions**: one PERFORMER session.

### TC-MAIN-005 — ADMIN_TOKEN rotation: grace window and break-glass [NEG/BOUNDARY]
- **Traceability**: FR-427 break-glass, `lib/security/adminAuth.ts`
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative + Boundary | **Technique**: state transition
- **Pre-conditions**: staff sessions active; env `ADMIN_OLD_TOKEN_EXPIRES_AT` set 24 h in the future; old token = `qa_admin_oldtoken_rotated_1122334455`, new = `qa_admin_breakglass_0987654321`
- **Steps**: 1. `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer qa_admin_oldtoken_rotated_1122334455" $BASE/api/admin/items` → expect 200 + log `[OLD_ADMIN_TOKEN_USED]`. 2. Same with `qa_admin_breakglass_0987654321` → 200. 3. Same with garbage `Bearer deadbeef` → 403. 4. Set `ADMIN_OLD_TOKEN_EXPIRES_AT` in the past, restart, repeat step 1 → 403 + `[OLD_ADMIN_TOKEN_REJECTED]`.
- **Expected**: old token honored only inside grace window and always logged; unknown token 403 with no mutation; expired grace → 403.
- **Post-conditions**: none.

### TC-MAIN-042 — Integration profile fail-closed [NEG]
- **Traceability**: `lib/config/integrationProfile.ts`, `ERR_INTEGRATION_PROFILE_VIOLATION`
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: env matrix
- **Steps** (each: set env, attempt server start): 1. `ENABLED_EXTERNAL_INTEGRATION=TELEGRAM_BUNDLE` + `NOWPAYMENTS_API_KEY=x` → start must abort. 2. `ENABLED_EXTERNAL_INTEGRATION=NONE` + `BOT_TOKEN=123456:ABC` → abort. 3. Any profile + `SUPPORT_BOT_TOKEN=x` → abort. 4. Valid `TELEGRAM_BUNDLE` with both tokens, no foreign keys → boots.
- **Expected**: 1–3 refuse to start with `ERR_INTEGRATION_PROFILE_VIOLATION` naming the offending key (`ERR_MIXED_INTEGRATION_CREDENTIALS` / `ERR_FORBIDDEN_TELEGRAM_TOKENS` / `ERR_THIRD_BOT_TOKEN_FORBIDDEN`); 4 boots clean.
- **Post-conditions**: restore valid env.

### TC-MAIN-043 — Feature-flag killswitch matrix
- **Traceability**: `ReleaseReadinessFlags`, FLAG_ENV_MAP
- **Tier**: API-Manual + E2E-Manual | **Priority**: P1 | **Type**: Positive (rollback semantics) | **Technique**: pairwise flag toggling
- **Pre-conditions**: cut-over state bookings exist; flags toggled one at a time to `false` + server restart
- **Steps/Expected** (per flag, observable legacy behavior, no DDL, no 500s):
  1. `FEATURE_FLAG_FSM_CUTOVER=false` → new booking maps to legacy statuses (reservation `HELD`/`BOOKED` only; no `PAYMENT_PENDING` rows written).
  2. `FEATURE_FLAG_PAYMENT_PROVIDER_CUTOVER=false` → checkout completes without provider invoice; `PAY_ON_SITE` order stands.
  3. `FEATURE_FLAG_WAITLIST=false` → `/admin/waitlist` renders empty-state "disabled", `POST /api/waitlist` returns feature-disabled response, no fan-out job on cancellation.
  4. `FEATURE_FLAG_I18N=false` → web chrome reverts to legacy hardcoded strings (English), no next-intl lookups in logs.
  5. `FEATURE_FLAG_EMAIL_FALLBACK=false` → TG-only dispatch; no email rows in delivery log.
- **Post-conditions**: restore all five to `true`.

---

## B. Catalog, Cart & Slots

### TC-MAIN-010 — Multi-service cart sums (from TC-WEB-01, UPDATED)
- **Traceability**: FR-101/FR-102
- **Tier**: E2E-Manual | **Priority**: P0 | **Type**: Positive | **Technique**: happy path
- **Steps**: 1. Open `/`. 2. Add Service A and Service B to cart. 3. Open CartDrawer. 4. Proceed to `/book`.
- **Expected**: drawer shows 2 positions, total `$500.00`, total duration `1 ч 30 мин`; URL `/book` carries both `itemIds`.
- **Post-conditions**: cart persisted for TC-MAIN-011.

### TC-MAIN-011 — 30-min grid vs lunch & shift end [BOUNDARY]
- **Traceability**: FR-103, FR-442
- **Tier**: E2E-Manual + API-Manual | **Priority**: P0 | **Type**: Boundary | **Technique**: boundary values
- **Pre-conditions**: settings `slotGridStepMin=30`; day with lunch 13:00–14:00 UTC; cart = A+B (90 min); no other bookings
- **Steps**: 1. On `/book` pick the nearest weekday. 2. Check offered starts; cross-check with `POST /api/booking/slots` `{"itemIds":["<A>","<B>"]}`.
- **Expected**: offered starts are multiples of 30 min; `11:30` offered (ends 13:00 exactly); `12:00`, `12:30` absent; `14:00` present; last start of day `16:30`; `17:00`/`17:30` absent.
- **Post-conditions**: none.

### TC-MAIN-012 — 15-min grid + 45-min service legality [BOUNDARY]
- **Traceability**: FR-442 (duration % 15; grid = start interval)
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Boundary | **Technique**: config matrix
- **Pre-conditions**: owner sets `slotGridStepMin=15` in `/admin/settings`; create Service E `qa-mini-consult`, 45 min, 40000 minor
- **Steps**: 1. Book Service E alone; open `/book`. 2. Verify starts. 3. Revert setting to 30.
- **Expected**: starts at :00/:15/:30/:45; a 45-min window ending at break start is offered; with grid 30 the same service yields starts only at :00/:30 (45-min span on 30-grid is legal, no crash).
- **Post-conditions**: grid back to 30.

### TC-MAIN-013 — minNoticeMin boundary [BOUNDARY]
- **Traceability**: FR-02/FR-103
- **Tier**: API-Manual | **Priority**: P2 | **Type**: Boundary | **Technique**: boundary values
- **Pre-conditions**: `minNoticeMin=60`; shift opens 10:00 UTC today
- **Steps**: 1. At 09:20 UTC request slots for today. 2. At 09:00 UTC repeat.
- **Expected**: at 09:20 the 10:00 start is hidden (notice not met); at exactly 09:00 the 10:00 start appears (60 min ≤ notice).
- **Post-conditions**: none.

### TC-MAIN-040 — Double-booking guard 23P01 → 409 [NEG]
- **Traceability**: FR-005
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (concurrency) | **Technique**: race
- **Steps**: 1. `POST /api/booking/lock` for Service B on 10:00 with customer #1 → `201`. 2. Immediately `POST /api/booking/lock` same slot, customer #2.
- **Expected**: step 2 → HTTP `409`, body `{"error":"Selected slot has just been taken by another customer"}`; zero `SlotReservation` rows at 10:30 overlapping; UI (two tabs) shows the warning plate.
- **Post-conditions**: one HELD/BOOKED reservation.

### TC-MAIN-050 — Server distrusts client cart [NEG]
- **Traceability**: FR-102, FR-002a
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: error guessing
- **Steps** (each a separate `POST /api/booking/lock` payload): 1. `itemIds:["<B>","<B>"]` → expect `400` code `DUPLICATE_CART_ITEM`. 2. `itemIds:["00000000-0000-0000-0000-000000000000"]` → `400` `ITEM_NOT_FOUND_OR_INACTIVE`. 3. 11 distinct item ids → `400` with basket-limit code. 4. Cart summing >480 min → `400` `MAX_DURATION_EXCEEDED`.
- **Expected**: exact codes above; zero new `Order` rows after all four.
- **Post-conditions**: none.

### TC-MAIN-051 — Mixed service+product cart blocked [NEG]
- **Traceability**: FR-426
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: constraint check
- **Pre-conditions**: create product `qa-cable-kit`, 5000 minor (003 pack)
- **Steps**: 1. Add Service B + `qa-cable-kit` to cart. 2. Proceed to checkout and submit.
- **Expected**: checkout blocked with guidance "place two separate orders" (RU: «оформите два отдельных заказа»); error code `NON_SERVICE_ITEM_IN_BOOKING_CART` in API response; no order created.
- **Post-conditions**: none.

---

## C. Booking FSM — four track × payment combinations

### TC-MAIN-020 — FREE track, IN_CALL, approval off → auto-confirm
- **Traceability**: FR-116, FSM FREE/IN_CALL (004 US1)
- **Tier**: E2E-Manual | **Priority**: P0 | **Type**: Positive | **Technique**: state transition
- **Pre-conditions**: instance flag `requireStaffApprovalForInCall=false`; Service B
- **Steps**: 1. Book Service B 10:00 as customer #1 with notes `Просьба сделать акцент на проверке GiST-индексов`, paymentType `PAY_ON_SITE`. 2. Observe UI and DB.
- **Expected**: order `status=PENDING`, `confirmationStatus=STAFF_APPROVED` path skipped — reservation `status=BOOKED` immediately (CONFIRMED); fixed-price disclaimer visible above notes; success screen shows confirmed time. Staff card still delivered (FYI, no approval needed).
- **Post-conditions**: confirmed booking for mixed-surfacing TC-MAIN-110.

### TC-MAIN-021 — FREE track, OUT_CALL → PENDING_APPROVAL → approve/reject
- **Traceability**: FR-116, FSM FREE/OUT_CALL; FR-109
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Positive + Negative | **Technique**: state transition
- **Pre-conditions**: Service D; staff authorized id `777000111`
- **Steps**: 1. Book Service D 14:00 as customer #2 → reservation `PENDING_APPROVAL`. 2. Send staff callback `staff:reject:<orderId>` from `777000111`. 3. Rebook same slot; send `staff:approve:<orderId2>`.
- **Expected**: 1. reservation `PENDING_APPROVAL`, order `PENDING`/`PENDING_STAFF_REVIEW`. 2. → `status=APPLIED`, reservation `STAFF_REJECTED`, slot back on `/book`, client notified. 3. reservation `BOOKED`.
- **Post-conditions**: one confirmed OUT_CALL booking.

### TC-MAIN-030 — PREPAID track, IMMEDIATE: HELD → PAYMENT_PENDING → CONFIRMED
- **Traceability**: FR-407, FR-403, FR-401; PaymentType `PREPAYMENT_ONLINE` + timing `IMMEDIATE`
- **Tier**: API-Manual (crypto sandbox) | **Priority**: P0 | **Type**: Positive | **Technique**: state transition
- **Pre-conditions**: Service C; `FEATURE_FLAG_PAYMENT_PROVIDER_CUTOVER=true`; sandbox provider creds set
- **Steps**: 1. Book Service C 10:00 as customer #2 → `201`. 2. In DB check reservation + invoice. 3. Fire gateway events `waiting` → `confirming` → `finished` (sandbox `POST` with valid `x-nowpayments-sig` HMAC-SHA512 over sorted-keys JSON body, secret `qa_ipn_secret_777`).
- **Expected**: 1. reservation `HELD`, `holdExpiresAt ≈ now+15min`; order `AWAITING_PAYMENT`; invoice issued via provider contract (no hand-built URL). 2. after `waiting` → `PAYMENT_PENDING`; after `confirming` → `holdFrozenAt` set, TTL sweep suppressed. 3. after `finished` → reservation `BOOKED`, order `PAID`, immutable `PaymentEvent` row appended.
- **Post-conditions**: paid booking; used in TC-MAIN-100.

### TC-MAIN-031 — PREPAID track, AFTER_STAFF_APPROVAL → AWAITING_PAYMENT 15-min invoice
- **Traceability**: FR-116, FR-109
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Positive | **Technique**: state transition
- **Pre-conditions**: settings `prepaymentTiming=AFTER_STAFF_APPROVAL`, paymentType `PREPAYMENT_ONLINE`; new booking on Service C
- **Steps**: 1. Book → reservation `HELD`, `PENDING_STAFF_REVIEW`. 2. Staff callback `staff:approve:<id>`. 3. Client pays within window (sandbox `finished`).
- **Expected**: 2. order `AWAITING_PAYMENT`, `invoiceExpiresAt ≈ now+15min`, reservation stays `HELD`, event `order/staff-approved`. 3. order `PAID`, reservation `BOOKED`.
- **Post-conditions**: none.

### TC-MAIN-032 — Tampered crypto IPN rejected [NEG]
- **Traceability**: FR-012, STRIDE Tampering
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: mutation
- **Pre-conditions**: a `PAYMENT_PENDING` order exists (from TC-MAIN-030)
- **Steps**: 1. Replay the valid IPN with amount `amount` changed (recompute nothing). 2. Replay with wrong secret signature. 3. Replay valid signature but underpaid amount 98% of invoice.
- **Expected**: 1–2 → `422/403` signature/verification failure, zero DB mutation, security log entry. 3 → order `UNDERPAID` (see TC-MAIN-033), NOT confirmed (99% rule).
- **Post-conditions**: none.

### TC-MAIN-033 — UNDERPAID: staff resolution only [NEG]
- **Traceability**: FR-403 partially_paid; SLA ≤12h
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (process) | **Technique**: state transition
- **Steps**: 1. Send `GATEWAY_PARTIALLY_PAID` (sandbox) on the TC-MAIN-032 underpaid order. 2. Wait — no staff action. 3. Staff resolves via `STAFF_RESOLVE_CONFIRM` (admin/bookings action). 4. On a second underpaid order staff chooses resolve-cancel.
- **Expected**: 1. reservation `UNDERPAID`, staff notified, customer told top-up-or-cancel; no auto-confirm ever. 3. → `BOOKED`/`PAID`. 4. → released `CANCELLED`, refund/refund-request recorded.
- **Post-conditions**: none.

### TC-MAIN-034 — Hold TTL 15 min vs confirming freeze [BOUNDARY]
- **Traceability**: FR-433, FR-404 (24 h ceiling)
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Boundary | **Technique**: time manipulation
- **Steps**: 1. Book Service C; do NOT pay; force `deadlineSweeper` run after `holdExpiresAt` → reservation released `CANCELLED`, order `PAYMENT_EXPIRED`. 2. New booking; sandbox `confirming` event; force sweep past original TTL → hold survives (`FROZEN`). 3. Simulate `holdFrozenAt` = 25 h ago (DB edit on staging) + sweep → hold expires, order → FR-432 resolution.
- **Expected**: exact verdicts `EXPIRED` / `FROZEN` / `FREEZE_CEILING_EXCEEDED` per `evaluateHoldExpiry`; no silent double-release.
- **Post-conditions**: none.

### TC-MAIN-035 — Late payment after slot re-booked → PAID_REQUIRES_RESOLUTION [BOUNDARY]
- **Traceability**: FR-444, FR-432 (refund ≤24 h SLA)
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Boundary | **Technique**: state transition
- **Steps**: 1. Booking X on 10:00 `HELD` → expire TTL → slot released. 2. Customer #1 books 10:00 (new order). 3. Late `GATEWAY_FINISHED` for expired X arrives.
- **Expected**: X → order `PAID_REQUIRES_RESOLUTION`, reservation stays `RELEASED`, staff resolution task with SLA created, refund request row for late payer, BOTH parties notified; customer #1's booking untouched.
- **Post-conditions**: resolution task open for staff.

### TC-MAIN-036 — Customer cancels prepaid booking → refund per policy [NEG]
- **Traceability**: FR-430, FSM CUSTOMER_CANCEL
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: state transition
- **Steps**: 1. On a paid (CONFIRMED) prepaid booking within cancellation policy window, customer triggers cancel via bot/token flow. 2. Repeat outside policy window.
- **Expected**: 1. order `CANCELLED`, reservation `RELEASED`, `RefundOperation` created, both parties notified. 2. cancel rejected with policy-window message; booking intact.
- **Post-conditions**: none.

---

## D. Bots & mixed surfacing

### TC-MAIN-060 — Client webhook rejects wrong secret [NEG]
- **Traceability**: FR-04
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: negative input
- **Steps**: `POST /api/bot/telegram/webhook` with header `X-Telegram-Bot-Api-Secret-Token: wrong_secret`, body `/start` update.
- **Expected**: HTTP `403`; `InboxEvent` row count unchanged. Repeat against `/api/bot/staff/webhook` with wrong `STAFF_WEBHOOK_SECRET` → 403.
- **Post-conditions**: none.

### TC-MAIN-061 — `/start` inbox idempotency + greeting
- **Traceability**: FR-04, FR-14
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive + Negative | **Technique**: idempotency
- **Steps**: 1. `POST` update `update_id=900000001`, chat `555111`, text `/start`, valid secret. 2. Repeat identical body.
- **Expected**: 1. `200`, exactly one `InboxEvent` (`provider=TELEGRAM`, `kind=TELEGRAM_UPDATE`); live bot (if wired) replies greeting with menu. 2. `200` `OK (duplicate)`, no new row.
- **Post-conditions**: none.

### TC-MAIN-062 — customerTgId without initData → 401 [NEG]
- **Traceability**: FR-05
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: negative input
- **Steps**: `POST /api/booking/lock` with `customerTgId=555111`, no `initData`.
- **Expected**: `401`, body contains `customerTgId provided without valid initData HMAC`; no order.
- **Post-conditions**: none.

### TC-MAIN-063 — Signed initData accepted (FREE track)
- **Traceability**: FR-05
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: happy path
- **Pre-conditions**: live `TELEGRAM_BOT_TOKEN` in env
- **Steps**: `POST /api/booking/lock` with `customerTgId=555111` and HMAC-signed initData (`secret_key = HMAC_SHA256("WebAppData", token)`; `auth_date = now`).
- **Expected**: `201`; `Order.customerTgId=555111`. Then repeat with `auth_date` = now − 3700 s → `401` (age > 3600 s) [BOUNDARY].
- **Post-conditions**: none.

### TC-MAIN-070 — Staff card masking, 6 buttons, copy contacts
- **Traceability**: FR-107, FR-008, FR-123
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Positive + Negative (privacy) | **Technique**: checklist
- **Pre-conditions**: booking by customer #1 with phone `+7 (999) 123-45-67`, notes `Сделайте скидку 50%, у меня аллергия`
- **Steps**: 1. Trigger card into staff group. 2. Inspect text + keyboard. 3. Tap `📋 Копировать контакты` (`staff:copy_contacts:<orderId>`).
- **Expected**: phone masked `+7 *** *** 4567`; digits `1234567` absent; notes text absent (placeholder "есть примечания"); buttons `staff:approve|reject|reschedule|blacklist|fulfill` + copy action, all carrying orderId; copy action answers with a formatted contacts card to staff chat only. Strings match instance language (ru/en).
- **Post-conditions**: none.

### TC-MAIN-080 — Client confirms reminder push
- **Traceability**: FR-012/FR-013
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: state transition
- **Pre-conditions**: booking in `STAFF_APPROVED`/`BOOKED` (from TC-MAIN-021/020)
- **Steps**: send callback `client:confirm:<orderId>` from chat `555111` via client webhook.
- **Expected**: `200` `status: APPLIED`; `confirmationStatus=CLIENT_CONFIRMED`; `scheduleVersion` +1; event `order/client-confirmed` emitted; novice auto-cancel job cleared.
- **Post-conditions**: confirmed client state.

### TC-MAIN-081 — Client declines → cancelled [NEG]
- **Traceability**: FR-012
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: state transition
- **Steps**: on a second confirmed booking send `client:decline:<orderId>`.
- **Expected**: `Order.status=CANCELLED`, `cancellationReason=CLIENT_DECLINED`, reservation `RELEASED`, slot reappears on `/book` and (flag on) triggers waitlist fan-out.
- **Post-conditions**: freed slot used by TC-MAIN-122.

### TC-MAIN-082 — Novice auto-cancel deadline [BOUNDARY]
- **Traceability**: FR-112
- **Tier**: API-Manual | **Priority**: P2 | **Type**: Boundary | **Technique**: time manipulation
- **Pre-conditions**: customer with zero fulfilled orders; `autoCancelDeadlineHours=6`
- **Steps**: 1. Booking in `STAFF_APPROVED`, no client confirmation; force sweeper at 5 h 59 m → nothing. 2. Force at 6 h → cancelled.
- **Expected**: at deadline order `CANCELLED`, reason `AUTO_CANCELLED_NO_CONFIRMATION`, reservation `RELEASED`. Repeat for a returning customer (≥1 fulfilled) → booking survives + staff alert.
- **Post-conditions**: none.

### TC-MAIN-090 — Outsider taps staff button → 403 [NEG]
- **Traceability**: FR-007, STRIDE Elevation
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: negative input
- **Steps**: send callback `staff:approve:<orderId>` from tg id `999999999` in staff group webhook.
- **Expected**: HTTP `403`, `status: ACCESS_DENIED`; `confirmationStatus` unchanged; no `staff_cbq_` dedup row written; DB untouched.

### TC-MAIN-091 — Approve idempotency (CAS + dedup) [NEG]
- **Traceability**: FR-109
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative + Positive | **Technique**: idempotency
- **Steps**: 1. `staff:approve` (callback id `cbq-qa-1`) → APPLIED. 2. Same id again. 3. New id `cbq-qa-2` on same order.
- **Expected**: 1. `order/staff-approved` event, `scheduleVersion` +1. 2. `status: DUPLICATE_CALLBACK`. 3. `status: ALREADY_PROCESSED`. Exactly one version bump total.
- **Post-conditions**: order in approved state for TC-MAIN-092.

### TC-MAIN-092 — Magic reschedule link: one-time + reissue kill [NEG]
- **Traceability**: FR-011
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: state transition
- **Steps**: 1. `staff:reschedule` → capture URL params (`orderId`,`version`,`expiresAt`,`nonce`,`sig`). 2. DB check `rescheduleTokenHash = sha256(nonce)`, `confirmationStatus=RESCHEDULE_OFFERED`. 3. Second `staff:reschedule` → new nonce. 4. Open old link in browser; then the new one.
- **Expected**: 3. new nonce ≠ old; old hash overwritten. 4. old link rejected (hash mismatch), new link renders reschedule page once; after use `rescheduleTokenConsumedAt` set and a second open fails.
- **Post-conditions**: booking moved (or canceled) via page.

### TC-MAIN-093 — Blacklist by E.164, unblock audited [NEG]
- **Traceability**: FR-017
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: equivalence
- **Steps**: 1. Booking by `+79998887766`; `staff:blacklist`. 2. New booking with `+7 (999) 888-77-66` (formatted differently). 3. `POST /api/admin/users/unblock` `{"actor":"admin_valera", ...}`. 4. Booking again.
- **Expected**: 1. order `CANCELLED` reason `CLIENT_BLOCKED`, reservation `RELEASED`, `confirmationStatus` stays `PENDING_STAFF_REVIEW`, GDPR markup task emitted. 2. `403` `{"error":"Access restricted"}` (E.164 match). 3. `200` + `[CLIENT_UNBLOCKED]` audit. 4. `201`.
- **Post-conditions**: customer unblocked.

### TC-MAIN-094 — Fulfill closes order, scrubs card, regular client
- **Traceability**: FR-021, FR-120
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: state transition
- **Pre-conditions**: booking from TC-MAIN-021 step 3, confirmed
- **Steps**: `staff:fulfill`.
- **Expected**: order `FULFILLED`; `InboxEvent` task `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` priority `100` action `editMessageText`; customer's next booking has `autoCancelOnNoConfirmation=false`.
- **Post-conditions**: customer now "regular".

### TC-MAIN-110 — Mixed surfacing consistency (web + client bot + staff bot + admin)
- **Traceability**: cross-cutting (US4, FR-107, admin bookings)
- **Tier**: E2E-Manual | **Priority**: P0 | **Type**: Positive (consistency) | **Technique**: walkthrough
- **Steps**: take the TC-MAIN-020 order; view simultaneously in `/admin/bookings`, staff-bot card, client bot "my bookings", and public `/book` grid.
- **Expected**: all four surfaces show the same status mapping (confirmed ⇒ BOOKED/PAID same slot/time), same date rendering (locale word-month), no surface shows a stale state after any transition performed during section C.

---

## E. Admin content, waitlist, custom fields, i18n, ops

### TC-MAIN-120 — Content admin quick-create + tabs
- **Traceability**: FR-436–443 (US9), FR-01
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: happy path
- **Steps**: 1. Owner → `/admin/catalog`: quick-create service `qa-deep-tissue` (name, 60 min, 70000 minor, category) — ≤4 required fields. 2. Toggle it inactive. 3. Check `/admin/settings` shows grid-step selector 15|30 and staff ids; `/admin/team`, `/admin/waitlist`, `/admin/fields`, `/admin/bookings` all render.
- **Expected**: service created live (no draft workflow); audit `[ADMIN_ACTION]` rows; inactive toggle immediate; all six tabs render with no console errors.
- **Post-conditions**: `qa-deep-tissue` inactive for TC-MAIN-121.

### TC-MAIN-121 — Inactive service hidden publicly, intact in admin [NEG]
- **Traceability**: FR-01 (public = active only)
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: partition
- **Steps**: 1. `GET /api/catalog` and `GET /api/catalog/qa-deep-tissue`. 2. Open storefront as visitor.
- **Expected**: inactive item absent from list; direct slug → 404; admin catalog still lists it (soft delete, no hard delete — FR-423).
- **Post-conditions**: none.

### TC-MAIN-122 — Waitlist atomic claim race [BOUNDARY]
- **Traceability**: FR-419/420/433
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Boundary (concurrency) | **Technique**: race
- **Pre-conditions**: customers #1 (tg 555111) and #2 (tg 555112) on waitlist for Service B; a matching booking is cancelled (TC-MAIN-081)
- **Steps**: 1. Verify both got Telegram offers ≤60 s. 2. Both tap "claim" within the same second.
- **Expected**: exactly one booking created (FREE→confirmed; PREPAID→HELD with payment TTL); other gets "already taken"; freed-slot offer waves ≤3 or 24 h cap; slot also bookable publicly (notification priority, not reservation).
- **Post-conditions**: winner booking active.

### TC-MAIN-123 — Waitlist anti-spam caps [NEG]
- **Traceability**: FR-419
- **Tier**: API-Manual | **Priority**: P2 | **Type**: Negative | **Technique**: boundary values
- **Steps**: 1. Customer #1 creates 11th ACTIVE waitlist entry. 2. Attempt 2nd offer claim within 24 h / 3rd within day.
- **Expected**: 11th entry rejected; cap-violating claims rejected with explicit message; contact-only (non-TG) join attempt rejected with guidance (FR-419).
- **Post-conditions**: none.

### TC-MAIN-124 — Required custom field blocks submission [NEG]
- **Traceability**: FR-423/434 (US6)
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Negative | **Technique**: validation
- **Pre-conditions**: owner in `/admin/fields` creates field `Floor number` (number, required, bound to Service D)
- **Steps**: 1. Book Service D leaving field empty. 2. Enter `3000` characters of text in a text custom field. 3. Enter `12` and submit.
- **Expected**: 1. submission blocked with field-level error. 2. >1000 chars rejected (cap FR-434). 3. booking created; answer visible to authorized staff in admin bookings, absent from public surfaces.
- **Post-conditions**: none.

### TC-MAIN-125 — Custom field deactivation keeps history [BOUNDARY]
- **Traceability**: FR-423 (no hard delete)
- **Tier**: E2E-Manual | **Priority**: P2 | **Type**: Boundary | **Technique**: lifecycle
- **Steps**: 1. Deactivate field `Floor number`. 2. Open an old booking that answered it. 3. Book Service D again.
- **Expected**: old booking still shows answer with definition snapshot; new form no longer renders the field; hard delete attempt (API) forbidden.
- **Post-conditions**: none.

### TC-MAIN-130 — i18n ru/en across web
- **Traceability**: FR-411/FR-412 (US3)
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: equivalence
- **Steps**: 1. Switch instance default to `en`; anonymous session opens `/`. 2. Switch user profile language to `ru` (or Telegram `language_code=ru`); reload Mini App and web.
- **Expected**: chrome fully translated on both; dates use word-month per locale (`25 октября` / `October 25`); owner content stays in authored language (surrogate-content limitation); unsupported `language_code=de` falls back to instance default with no error.
- **Post-conditions**: none.

### TC-MAIN-131 — i18n bots + admin consistency
- **Traceability**: FR-411, T041
- **Tier**: E2E-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: equivalence
- **Steps**: for both ru and en users: trigger `/start` greeting, reminder push, staff card, client confirm/decline replies.
- **Expected**: all bot strings and admin chrome render in the user's/instance language; no mixed-language sentence; audit logs remain locale-neutral.

### TC-MAIN-132 — Russian plural forms [BOUNDARY]
- **Traceability**: FR-411 (CLDR plurals)
- **Tier**: E2E-Manual | **Priority**: P2 | **Type**: Boundary | **Technique**: boundary values
- **Steps**: render cart/booking summaries with 1, 2, 5, 21 услуг.
- **Expected**: `1 услуга / 2 услуги / 5 услуг / 21 услуга` — no `count === 1` binary artifact.

### TC-MAIN-140 — Health endpoint
- **Traceability**: FR-15
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive + Negative | **Technique**: fault injection
- **Steps**: 1. `GET /api/health` healthy DB. 2. Stop postgres container; repeat.
- **Expected**: 1. `200`, no secrets/PII in body. 2. `503`, no stack trace leak.
- **Post-conditions**: restart DB.

### TC-MAIN-150 — Rate limiter perimeter [NEG]
- **Traceability**: NFR-03
- **Tier**: API-Manual | **Priority**: P2 | **Type**: Negative | **Technique**: load
- **Steps**: 11 rapid `POST /api/booking/slots` from one key within 60 s.
- **Expected**: request #11 → `429`; counter resets after 60 s.

### TC-MAIN-151 — Zero-PII in logs [NEG]
- **Traceability**: FR-16, NFR (privacy), STRIDE Info Disclosure
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Negative (security) | **Technique**: audit
- **Steps**: 1. Perform a booking with phone `+79991112233` and notes `Сделайте скидку 50%`. 2. Trigger an OTP send and a reschedule link. 3. Grep staging logs (stdout + files) for `79991112233`, `Сделайте скидку`, `rescheduleToken` raw value, `otp` raw value, `initData` raw string.
- **Expected**: zero raw-PII hits; masked forms only; redaction deny-list confirmed for `customerNotes`, `phone`, `otp`, `initData`, `rawBody`.
- **Post-conditions**: none.

### TC-MAIN-152 — GDPR purge end-to-end
- **Traceability**: FR-120, §7 retention
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Positive | **Technique**: state transition
- **Steps**: 1. `POST /api/admin/orders/<id>/purge`. 2. Check DB + staff chat message + delivery log.
- **Expected**: `customerName/Phone/Notes` nulled; priority-100 redaction task replaces staff-card text with `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]`; `PaymentEvent` rows retained (bookkeeping, 5-year retention).

### TC-MAIN-100 — Refunds separated, PaymentEvent immutable
- **Traceability**: FR-122
- **Tier**: API-Manual | **Priority**: P0 | **Type**: Positive + Negative | **Technique**: idempotency
- **Pre-conditions**: paid crypto order (TC-MAIN-030)
- **Steps**: 1. `POST` refund `kind=CRYPTO_REIMBURSEMENT`, `asset=USDT`, `network=TRC20`, `destination=TQn9Y2khDD95J42FQtQTdwVVRZq5Nq2x1m` (28 chars), `idempotencyKey=refund_main_qa_001`. 2. Repeat same key. 3. Count `PaymentEvent` rows.
- **Expected**: 1. `201`, `refundStatus=REFUNDED`, `RefundOperation.status=CONFIRMED`. 2. `200` `deduplicated: true`, no new row. 3. row count unchanged across both calls. Stars refund (`TELEGRAM_STARS_REFUND`) — sandbox/live path per 002 `16-refund.sh` step B.
- **Post-conditions**: none.

### TC-MAIN-101 — Refund after FR-432 resolution honors 24 h SLA [BOUNDARY]
- **Traceability**: FR-432
- **Tier**: API-Manual | **Priority**: P1 | **Type**: Boundary | **Technique**: state transition
- **Steps**: complete TC-MAIN-035; staff approves resolution; verify refund record timestamps and notification.
- **Expected**: `RefundOperation` recorded with 24 h SLA; late payer notified "payment received, slot already taken, refund initiated"; second customer's booking untouched.

### TC-MAIN-140b — Upload bounds R2 [BOUNDARY]
- **Traceability**: FR-441
- **Tier**: E2E-Manual | **Priority**: P3 | **Type**: Boundary | **Technique**: boundary values
- **Steps**: upload service image 199 KB WebP 1200 px → accept; 210 KB → reject; 1300 px → reject; with R2 presign unreachable → save-without-image succeeds.
- **Expected**: exact bounds enforced (`WebP ≤ 200 000 bytes, ≤ 1200 px`); degradation path does not block content save.
