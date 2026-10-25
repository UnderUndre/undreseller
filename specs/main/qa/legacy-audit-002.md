# Legacy Audit — 002 Manual QA Checklists (verdict per TC)

**Scope audited**: `specs/002-service-cart-and-staff-bot/checklists/manual-qa.md` + `specs/002-service-cart-and-staff-bot/checklists/TESTING-CHECKLIST.md` (audit only — files untouched).
**Baseline of change**: 003 (booking-first template, staff web sign-in + sessions + RBAC OWNER/OPERATOR/PERFORMER, locations, instance-configurable settings) and 004 (two-track booking FSM `lib/kernel/bookingFsm.ts`, provider-neutral payments, i18n ru/en, waitlist, custom fields, feature flags `FEATURE_FLAG_*`, content admin).

**Read this first**: if a verdict is SUPERSEDED or OBSOLETE, the old expected result is **wrong today** — do not run it. Follow the replacement `TC-MAIN-NNN` in `test-cases.md`.

## Verdict counts

| Verdict | Count | Meaning |
|---|---|---|
| VALID | 6 | Runs as-is (data/steps unchanged) |
| UPDATED | 8 | Intent survives; steps/expected results rewritten for 003/004 behavior |
| SUPERSEDED | 4 | Covered by a newer mechanism; old case retired, replacement referenced |
| OBSOLETE | 12 | Expectations contradict current schema/FSM/RBAC — must NOT be run |

## Part 1 — manual-qa.md (the scripted suite)

| TC | Verdict | What changed in 003/004 | Replacement |
|---|---|---|---|
| TC-WEB-01 (multi-service cart sums) | **UPDATED** | Cart math unchanged; slot grid step is now instance-configurable (`slotGridStepMin` 15\|30, FR-442) and services carry location/fulfillment mode (003). The hardcoded 90-min window math only holds when the instance grid is 30. | TC-MAIN-010, TC-MAIN-011 |
| TC-WEB-02 (30-min slot grid) | **UPDATED** | Grid is no longer hardwired to 30 min: owner selects 15\|30 in admin settings; slots are computed per IANA timezone incl. DST (004 US2). Expectation "grid exactly 30 min" is now "grid equals configured `slotGridStepMin`". | TC-MAIN-012, TC-MAIN-013 (boundary 15-min grid, 45-min service) |
| TC-WEB-03 (checkout, notes, PAY_ON_SITE) | **UPDATED** | Booking statuses moved to the two-track FSM: reservation starts `HELD`/`PENDING_APPROVAL`/`BOOKED` per track instead of legacy mapping; custom fields (004 US6) may render on the form; fixed-price disclaimer survives; hand-built payment URL removed (provider contract FR-401). | TC-MAIN-020 (FREE track auto-confirm), TC-MAIN-030 (PREPAID HELD) |
| TC-WEB-04 (GiST 23P01 → 409) | **VALID** | Exclusion constraint `slot_resource_no_overlap` unchanged by 003/004; FSM wraps it but the 409 contract is identical. Re-run under `FEATURE_FLAG_FSM_CUTOVER=true`. | TC-MAIN-040 (re-badged) |
| TC-WEB-05 (server distrusts cart: duplicates, fake id) | **VALID** | Guard codes `DUPLICATE_CART_ITEM`, `ITEM_NOT_FOUND_OR_INACTIVE`, `NON_SERVICE_ITEM_IN_BOOKING_CART`, `MIXED_CART_CURRENCIES`, `MAX_DURATION_EXCEEDED` unchanged. Mixed service+product cart is now additionally BLOCKED at checkout (FR-426) — extra assertion added, not changed. | TC-MAIN-050 |
| TC-BOT-CLIENT-01 (wrong webhook secret → 403) | **VALID** | `X-Telegram-Bot-Api-Secret-Token` check unchanged for both bots. | TC-MAIN-060 |
| TC-BOT-CLIENT-02 (`/start` inbox idempotency by `update_id`) | **VALID** | Durable inbox + duplicate handling unchanged. | TC-MAIN-061 |
| TC-BOT-CLIENT-03 (customerTgId without initData → 401) | **VALID** | HMAC initData verification unchanged (±60s skew, 3600s age). | TC-MAIN-062 |
| TC-BOT-CLIENT-03b (valid signed initData → 201) | **UPDATED** | 201 still holds, but resulting reservation state depends on track/approval flags (FREE+no approval → `BOOKED` immediately; PREPAID → `HELD` 15 min). Old text "HELD always" is stale. | TC-MAIN-063 |
| TC-BOT-CLIENT-04 (client confirm callback → CLIENT_CONFIRMED) | **UPDATED** | Callbacks `client:confirm/decline` still wired, but confirmation now only valid from `STAFF_APPROVED`/`BOOKED` per FSM; `scheduleVersion` increment retained. Re-verify against FSM cutover. | TC-MAIN-080 |
| TC-BOT-STAFF-01 (order card masks phone/notes) | **UPDATED** | Card still masks PII, but button set is now 6 actions (`approve, reject, reschedule, blacklist, fulfill, copy_contacts`) + `staff:copy_contacts` (FR-123); notes are visible to session-authenticated staff in admin, not "защищённая админ-панель" token UI. i18n: card strings localize ru/en (T041). | TC-MAIN-070 |
| TC-BOT-STAFF-02 (outsider button → 403 ACCESS_DENIED) | **VALID** | `authorizeStaffCallback` 3-tier check unchanged; RBAC adds role ranking on top, outsider rejection identical. | TC-MAIN-090 |
| TC-BOT-STAFF-03 (approve idempotency CAS) | **UPDATED** | Idempotency keys (`staff_cbq_*`, DUPLICATE_CALLBACK, ALREADY_PROCESSED) unchanged, but approve outcome now branches: FREE track → `BOOKED`; `AFTER_STAFF_APPROVAL` + `PREPAYMENT_ONLINE` → `AWAITING_PAYMENT` + 15-min hold (this branch MUST now be exercised — old note "не покрыта" is resolved). | TC-MAIN-091, TC-MAIN-031 |
| TC-BOT-STAFF-04 (reschedule + one-time magic link) | **UPDATED** | HMAC one-time link unchanged (TTL 24h, nonce hash, new release kills old). Confirmation status flow interacts with the new FSM (`RESCHEDULE_OFFERED` only from confirmed states); link TTL must be re-verified under FSM cutover. | TC-MAIN-092 |
| TC-BOT-STAFF-05 (blacklist → 403, unblock) | **VALID** | E.164 blacklist, `CLIENT_BLOCKED`, `RELEASED`, audited unblock unchanged by 003/004. | TC-MAIN-093 |
| TC-BOT-STAFF-06 (fulfill → FULFILLED, GDPR markup, regular client) | **VALID** | Fulfill path, `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]` outbox task, `autoCancelOnNoConfirmation=false` for returning clients unchanged. | TC-MAIN-094 |
| TC-PAY-01 (separated refunds, immutable PaymentEvent) | **UPDATED** | Refund contract intact, but crypto now arrives via the provider-neutral IPN path (FR-401/FR-012) — refunds still `CRYPTO_REIMBURSEMENT`/`TELEGRAM_STARS_REFUND` with idempotency; add late-payment FR-432 refund assertions (24h SLA). | TC-MAIN-100, TC-MAIN-101 |

## Part 2 — TESTING-CHECKLIST.md (the older human checklist)

| TC (checklist row) | Verdict | What changed | Replacement |
|---|---|---|---|
| Env prep (docker/migrate/seed/webhooks) | **UPDATED** | Same steps, plus: staff seed now creates bootstrap OWNER with web sign-in; feature flags must be explicitly set; `slotGridStepMin` selector; crypto sandbox creds optional. | `regression-suite.md` §Prerequisites |
| TC-WEB-01 browser cart walk | **UPDATED** | UI flow unchanged, prices/totals identical; cart drawer includes location/mode info. | TC-MAIN-010 |
| TC-WEB-02 slot grid walk | **UPDATED** | "Шаг 30 мин" assertion wrong if instance grid = 15; disabled-slot reasons now surface "booked/break" (FR US2-4). | TC-MAIN-012 |
| TC-WEB-03 checkout form walk | **UPDATED** | Form now may include custom fields (required ones block submission); disclaimer retained; success screen shows FSM-aware hold/confirm status. | TC-MAIN-020 |
| TC-WEB-04 slot conflict (two browsers) | **VALID** | Same 409 contract; UI copy may be localized. | TC-MAIN-040 |
| TC-WEB-05 duplicate cart guard | **VALID** | Same `DUPLICATE_CART_ITEM` 400. | TC-MAIN-050 |
| TC-BOT-CLIENT-01 /start greeting | **VALID** | Greeting + menu unchanged; strings now i18n ru/en. | TC-MAIN-061 |
| TC-BOT-CLIENT-02 /help | **VALID** | Unchanged. | TC-MAIN-061 |
| TC-BOT-CLIENT-03 Web App opens | **VALID** | Mini App unchanged; theme-following assertion added in 004. | TC-MAIN-061 |
| TC-BOT-CLIENT-04 "Буду" → `status = 'CLIENT_CONFIRMED'` in `Order.status` | **OBSOLETE** | `CLIENT_CONFIRMED` lives in `ConfirmationStatus`, NOT `OrderStatus`. Checking `Order.status` for it is a guaranteed false fail. | TC-MAIN-080 |
| TC-BOT-CLIENT-05 "Не смогу" → `status = 'CLIENT_CANCELLED'` | **OBSOLETE** | No such enum value: correct result is `Order.status = CANCELLED`, `cancellationReason = CLIENT_DECLINED`, reservation `RELEASED`. | TC-MAIN-081 |
| TC-BOT-STAFF-01 card with "✅ Confirm / ❌ Decline / 📞 Contact" buttons | **OBSOLETE** | Button set is 6 `staff:*` actions; "📞 Contact" replaced by `staff:copy_contacts:<orderId>`; phone masked `+7 *** *** 4567`; notes NOT in card text (GDPR) — the checklist's "Заметки (если есть)" line contradicts FR-008. | TC-MAIN-070 |
| TC-BOT-STAFF-02 Confirm → `status = 'STAFF_CONFIRMED'` | **OBSOLETE** | `STAFF_CONFIRMED`/`STAFF_DECLINED` do not exist in `OrderStatus`. Correct: `confirmationStatus = STAFF_APPROVED`, reservation `BOOKED`. | TC-MAIN-091 |
| TC-BOT-STAFF-03 Staff requests Stars payment | **SUPERSEDED** | No staff-driven invoice button exists; prepayment is issued automatically by the provider contract at booking/approval time (FR-401). | TC-MAIN-030, TC-MAIN-031 |
| TC-BOT-STAFF-04 refund via `16-refund.sh` | **VALID** | Script path still exists; see TC-PAY-01 verdict (UPDATED) for added FR-432 assertions. | TC-MAIN-100 |
| TC-BOT-STAFF-05 three independent orders | **VALID** | Per-order callback routing unchanged. | TC-MAIN-091 |
| Этап 4: DB status list (`STAFF_PENDING…COMPLETED, AUTO_CANCELLED…`) | **OBSOLETE** | Fictional enum. Real `OrderStatus`: `PENDING, AWAITING_PAYMENT, PAID, PAID_REQUIRES_RESOLUTION, CANCELLED, FULFILLED, PAYMENT_EXPIRED`; `AUTO_CANCELLED_NO_CONFIRMATION` is a `cancellationReason`. | TC-MAIN-110 (DB consistency) |
| Этап 5: cart API `/api/cart` GET/POST/DELETE sync | **SUPERSEDED** | Cart became stateless client-side with server-authoritative snapshot at booking; no server cart table to poll. Verify via booking lock guards instead. | TC-MAIN-050 |
| Этап 5: statuses "STAFF_PENDING или STAFF_CONFIRMED" | **OBSOLETE** | Same fictional enum as Этап 4. | TC-MAIN-110 |
| Defect-log template / final sign-off | **VALID** | Process, not behavior. Keep using it. | — |

## Notes for testers

1. **Auth reality (003/004)**: primary admin/staff auth is web sign-in (`/admin/login`, scrypt + session cookie `session_token`, 7-day TTL, rotation on login, 5-fails→15-min lockout — `lib/security/staffSignIn.ts`). `ADMIN_TOKEN` Bearer remains a break-glass API path with old-token grace window (`lib/security/adminAuth.ts` `[OLD_ADMIN_TOKEN_USED]`). Any 002-era test that assumes token-only admin access is **UPDATED**, not VALID.
2. **FSM reality (004)**: with `FEATURE_FLAG_FSM_CUTOVER=true` the reservation enum adds `PAYMENT_PENDING | UNDERPAID | PENDING_APPROVAL | CANCELLED | STAFF_REJECTED` (`prisma/schema.prisma` `ReservationStatus`), and spec-state CONFIRMED ≡ DB `BOOKED`. Legacy status mapping tests fail by design under the flag.
3. **Payments reality (004)**: no hand-built payment URL. Invoice issuance goes through the `PaymentProvider` contract (`FEATURE_FLAG_PAYMENT_PROVIDER_CUTOVER`); `PaymentType = PAY_ON_SITE | PREPAYMENT_ONLINE` × `PrepaymentTiming = IMMEDIATE | AFTER_STAFF_APPROVAL`.
4. **Grid reality**: `slotGridStepMin` is instance settings (15|30). Duration quantum is 15 min (a 45-min service on a 30-min grid is legal — FR-442).
