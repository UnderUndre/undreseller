# Evidence: 007-booking-trust-gate implementation summary

**Date**: 2026-11-11 · **Base**: `e64dc2e` (spec rev 1.2) · **Tasks**: T710–T741, 8/8 `[X]`

## Gate results

| Gate | Result |
|---|---|
| `tsc --noEmit` (validate) | PASS (0 errors) |
| eslint | PASS (0 errors; 246 warnings = repo baseline canon) |
| vitest int | **PASS 186/186** (164 legacy + 22 new trust-gate) — `test-run-full-regression.log` |
| `next build` | PASS (exit 0) |
| Spike disposal | zz-perf-spike spec deleted after measurement |

## Task → artifact map

| Task | Deliverables |
|---|---|
| T710 | `src/lib/booking/otp.ts`, `src/collections/BookingIntents.ts`, `src/lib/booking/intentService.ts` (createIntent/verifyIntentBooking/resendIntent), `src/jobs/intentSweep.ts`, payload.config registration, `bookingService.findBookingByIdempotencyKey` export |
| T711 | `templates.otpEmail`, `resendAdapter.logDelivery` kind widening, EmailDeliveryLog kind `+= intent, waitlist-optin` |
| T720 | `src/app/api/booking/route.ts` two-phase, `src/app/api/booking/resend/route.ts`, STM tests (×20 concurrent verify → 1 booking) |
| T721 | `src/lib/security/honeypot.ts` + route guards + `SlotGrid`/`WaitlistJoinForm`/`BookingFormOTP` fields |
| T730 | join→pending + opt-in email + F9 resend-on-pending, `confirmWaitlistEntry`, `/api/waitlist/[entryId]/confirm`, `/book/waitlist-confirm` scanner-safe landing, sweep pending>48h |
| T731 | trust-cookie (`trustCookie.ts`, F1), intent sweep 5m (F10), gdprPurge 30d/90d (F7), EP-tests |
| T740 | `seams-review.md` (1 pre-existing 006 bug fixed, 1 self-review race fixed) |
| T741 | this summary + perf/bruteforce/honeypot artifacts + task statuses |

## Implementation decisions (spec-silent points, for reviewer attention)

1. **OTP email = inline, no job**: the plaintext code can NEVER travel in a job
   input (jobs persist input JSON in `payload_jobs` — would violate audit C1
   "plaintext-кода в БД нет"). Send happens inline in `createIntent`/`resendIntent`
   (best-effort, delivery-log canon); recovery = the F2 resend endpoint. The
   spec's "retry через job-канон" edge-case is satisfied by the resend contract.
2. **Resend route** = separate `POST /api/booking/resend` (plan.md structure) —
   research D3's `resend: true` flag predated the F2 review round.
3. **Resend does NOT reset `attempts`** — the brute-force gate is per-intent,
   rotation must not re-arm it (spec-silent → conservative choice).
4. **Trust cookie re-issued on every successful booking** through the public
   route (fresh verify AND skip-OTP) — sliding 90d window.
5. **Phase-1 requires `customerEmail`** (was optional pre-007) — the OTP has
   nowhere else to go; breaking change to the public route contract, covered by
   NFR-701 regression (all legacy tests call the service layer).
6. **Expired-but-still-pending intent** in phase 2 → `403 INTENT_DEAD` without
   a status write; the sweep (F10) is the ONLY expired-writer.
7. **NFR-703 create budget**: strict full-path reading FAILS (see perf-p95.md) —
   flagged for code review, not papered over.
8. **Plan-structure deviation**: added `src/lib/security/honeypot.ts` (shared
   silent-reject helper for both routes) — not in plan.md structure, justified
   by DRY + testability (DT-тесты call the helper directly).
