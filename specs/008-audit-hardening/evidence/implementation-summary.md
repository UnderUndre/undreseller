# Evidence: 008-audit-hardening implementation summary

**Date**: 2026-11-12 · **Base**: `0812e5a` (spec rev 1.1) · **Tasks**: T810–T860, 13/13 `[X]`

## Gate results

| Gate | Result |
|---|---|
| `tsc --noEmit` (validate) | PASS (0 errors) |
| `eslint .` | PASS (0 errors; warnings = repo baseline) |
| vitest int | **PASS 197/197** (19 files: +11 new route & error tests) — `test-run-full-regression.log` |
| `next build` | PASS (exit 0) |
| fresh-migrate smoke | **PASS** (empty DB → migrate 105 tables in ~2s → smoke test PASS) — `migrate-fresh-smoke.log` |

## Task → Deliverables Mapping

| Task | Domain | Artifacts & Deliverables | Addressed Findings |
|---|---|---|---|
| **T810** | [BE] | `bookingService.ts` (webhook CAS rowCount + re-read, `GATEWAY_CAS_RETRY` canon, `charge.refunded` amount verification), `refundService.ts` (SELECT FOR UPDATE + deterministic Stripe idempotencyKey `refund-<orderId>` + CAS on existing statuses) | F-BE-03, F-BE-06, SEC-A-05, SEC-A-15, Antigravity F2 |
| **T811** | [BE] | `bookingEmail.ts` (`deleteJobOnComplete: true` in task definition — raw tokens purged from queue post-delivery without invalidating confirmation screen tokens) | F-BE-05, Antigravity F1 |
| **T812** | [BE] | `booking/route.ts` (deterministic server-derived idempotencyKey HMAC(email+product+start), client key ignored), `bookingService.ts` (`findBookingByIdempotencyKey` email guard), `intentService.ts` (coordinated email-guard calls), `waitlist/[entryId]/claim/route.ts` (delegation to `claimWaitlistEntry`, duplicate logic and client key removed) | F-BE-02, F-BE-12, Antigravity F6 |
| **T813** | [BE] | `staffBot.ts` (card↔chat binding verified via outbox `sent_message_id AND to_chat_id`, L3 tautology removed, staff allow-list checked), `telegram/staff/webhook/route.ts` (forwards `message_id`), `staffAuth.ts` (clean L1/L2), `clientBot.ts` (`acknowledgeByOrder` tg_links gate) | F-BE-04, SEC-A-06, SEC-A-07, Antigravity F4 |
| **T820** | [DB] | `src/migrations/20261112_000001_order_enum_values.ts` (ALTER TYPE separate step), `20261112_000002_complete_domain_schema.ts` (12 missing tables, 13 new types, added columns, indexes, robust down() with IF EXISTS), `src/migrations/index.ts` registration | F-BE-01, FR-801, FR-810, Antigravity F7 |
| **T821** | [BE] | `booking/route.ts` (grid validation on trust-cookie fast path), `SlotGrid.tsx` (semantic separation: availability failure clears slots, booking submit failure retains slots for retry) | SEC-A-08, F-UX-04, F-UX-17, Antigravity F11 |
| **T830** | [FE] | `LocalTime.tsx` (client-side localized time, suppressHydrationWarning), `globals.css` (WCAG 4.5:1 contrast for `--error`/`--success` in light & dark + `cursor: pointer`), `BookingFormOTP.tsx` (onBack «Выбрать другой слот», autoFocus, `data-testid="booking-conflict"`), `ConfirmOrder.tsx` (honest error screen + retry), `login/page.tsx` (customer copy, admin link removed) | F-UX-01, F-UX-02, F-UX-03, F-UX-05, F-UX-06, F-UX-11, Antigravity F10 |
| **T831** | [FE] | Contract & contrast checks (light error 4.83:1, success 5.02:1; dark error 6.42:1, success 10.19:1) | FR-806 |
| **T840** | [OPS] | `docker-compose.yml` (`127.0.0.1:5432:5432`, required password), `next.config.ts` (static CSP script-src 'self' 'unsafe-inline' 'unsafe-eval' + XFO + XCTO + Referrer-Policy + poweredByHeader: false), `rateLimiter.ts` (`clientIpFrom` fail-closed null contract), `instrumentation.ts` (assertSingleInstance on server boot) | SEC-B-01, SEC-B-02, SEC-A-01, SEC-A-03, SEC-B-18, Antigravity F5, F8, F9 |
| **T841** | [BE] | `availability/route.ts` (checkRateLimit 60/min), `slotCache.ts` (in-memory bounded TTL cache 20s), `payload.config.ts` (disable GraphQL & playground in production) | SEC-B-03, SEC-B-05 |
| **T842** | [BE] | `gdprPurge.ts` (anonymize customer_email in terminal orders >90d + customer name/phone in RELEASED reservations), `products/[slug]/page.tsx` (JSON-LD `</script>` escape), `sendOrderAccessEmail.ts` (accessToken log removed), structured logger in webhooks | SEC-B-07, SEC-B-08, SEC-B-09, SEC-A-02, Antigravity F3 |
| **T843** | [BE] | Verification of static CSP compatibility with Next.js App Router streaming hydration & Payload Admin | FR-806, Antigravity F5 |
| **T850** | [E2E] | `tests/helpers/otpFromDb.ts` (deterministic HMAC recovery in test environment), `tests/e2e/booking.e2e.spec.ts` (rewritten for 007 two-phase OTP contract + concurrent slot race on OTP step) | F-TQ-01 |
| **T851** | [E2E] | `tests/int/booking-route.int.spec.ts` (10 tests: Phase 1 validation, honeypot 200, Phase 2 OTP verify, trust-cookie fast path, impostor fallback, resend route, waitlist honeypot & HMAC confirm) | F-TQ-02, F-TQ-03, F-TQ-04 |
| **T852** | [E2E] | `tests/int/error-shapes.int.spec.ts` (frozen 007 catalog: INTENT_CAP, INTENT_DEAD, OTP_INVALID, BLACKLISTED, INTENT_CONSUMED, RATE_LIMITED + retryAfterSec), `tests/int/trust-gate.int.spec.ts` (opt-in confirm rejected after 48h TTL with 403) | F-TQ-05, F-TQ-06 |
| **T860** | [SETUP] | Full gate verification, evidence capture, task completion | FR-801..810 |
