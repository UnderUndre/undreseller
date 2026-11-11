# Evidence: T740 — documented seams code review (FR-707)

Review pass over the seams booking ↔ waitlist ↔ intent ↔ email, per the
manual-QA `4c0d1ab` bug class checklist. Date: 2026-11-11, on the 007
implementation working tree.

## Findings

### F-01 [FIXED] — 006 legacy: `campaignExpired` referenced but never defined

`src/app/(app)/book/waitlist-claim/page.tsx` called `campaignExpired(...)` —
the function did not exist anywhere in the file. `tsc --noEmit` at HEAD
(`e64dc2e`) failed with 6 errors, one of them this one; the page would crash
with a ReferenceError exactly when a notified client opened a stale campaign
link. Bug class: **impure/undefined render seam** — the int contour never
renders pages, so it was invisible to the suite.

**Fix**: helper added to the page with the 30-minute campaign TTL canon
(`waitlistService.CAMPAIGN_TTL_MIN`); pre-existing HEAD `tsc` failure cleared.

### F-02 [FIXED pre-test] — 007 self-review: concurrent verify loser killed a consumed intent

First cut of `verifyIntentBooking`: on `SLOT_TAKEN` it marked the intent dead
and re-threw. In a concurrent verify of the SAME intent, the loser's
createBooking clash-check fires BEFORE createBooking's own 23505 idempotency
fallback → the loser would throw 409 while the winner holds the booking — and
would have dead-marked an already-consumed intent. Bug class: **race seam
between idempotency key and clash span**.

**Fix**: before declaring SLOT_TAKEN, re-check `findBookingByIdempotencyKey`;
a booking under our key = concurrent win → return the same idempotent booking.
Locked by the STM ×20 test (20/20 resolve, exactly 1 row).

### F-03 [REVIEWED, KEPT] — placeholder HMAC inside the create transaction

`createIntent` inserts with a placeholder digest and updates to the
context-bound HMAC in the SAME transaction (the HMAC needs the serial id from
RETURNING). No other connection can observe the intermediate state; a crash
rolls both writes back. Kept with a comment; alternative (pre-allocating the
id via `nextval`) rejected — fragile against Payload's identity column mode.

## Checklist sweep (no findings)

| Seam class | Check | Result |
|---|---|---|
| Function-props Server→Client | SlotGrid/BookingFormOTP/ConfirmOptinClient/WaitlistJoinForm props | all client→client or data-only ✓ |
| Маунты | new effects in 007 components | none added; SlotGrid effect deps stable (useCallback) ✓ |
| Роут-коллизии | `/api/booking/resend` (static) vs `/api/booking/[id]` (dynamic, GET-only) | static wins, no conflict ✓; `/book/waitlist-confirm` vs `/book/[slug]` static precedence ✓; collection slug `booking-intents` ≠ `/api/booking` ✓ |
| Relationship `_id` suffixes | raw SQL over `booking_intents` / `waitlist_entries` | `service_id_id` / `resource_id_id` used consistently in all queries ✓ |
| Impure render | new GET pages (`/book/waitlist-confirm`) | read-only SELECT; GET never mutates (F9) ✓ |
| Admin slug shadowing | `booking-intents` admin collection | no Next.js route shadowing ✓ |
| Error-catalog additions | INTENT_CAP / INTENT_DEAD / OTP_INVALID / BLACKLISTED / INTENT_CONSUMED / INTENT_NOT_FOUND / SLOT_NOT_AVAILABLE / RATE_LIMITED | deterministic shapes, mapped 1:1 in routes ✓ |
| Delivery-log kinds | `intent`, `waitlist-optin` added to collection + adapter + payload-types | synced via `generate:types` ✓ |

## Regression

186/186 int tests PASS (164 legacy + 22 new) — see
`test-run-full-regression.log`. Legacy waitlist suite updated to the 007
opt-in contract (join → `pending` → confirm → `waiting`); the 006 matching /
claim / race semantics are unchanged and green.
