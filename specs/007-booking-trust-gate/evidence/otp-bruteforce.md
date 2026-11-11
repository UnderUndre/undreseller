# Evidence: OTP + brute-force matrix (SC-001, FR-702)

Source: `tests/int/trust-gate.int.spec.ts` (22/22 PASS — full log
`test-run-trust-gate.log`, 2026-11-11).

## SC-001 brute-force guard

| Step | Action | Result |
|---|---|---|
| 1–4 | wrong code ×4 | `403 OTP_INVALID`, attempts 1→4 |
| 5 | wrong code ×5 | `403 OTP_INVALID`, attempts = 5, intent → `dead`, audit `intent.dead {reason: ATTEMPTS_EXHAUSTED}` |
| 6 | REAL code after death | `403 INTENT_DEAD` — the gate stays closed |
| 10⁶ combos / 5 attempts | — | brute-force impossible (attempts gate) |

## OTP matrix

| Case | Result |
|---|---|
| happy verify (correct code) | `201` BOOKED (FREE→CONFIRMED), intent `consumed` via CAS **after** createBooking (F4), audit `intent.consumed` |
| context binding (F6) | `verifyOtpCode(intentId, email, code)` passes ONLY with the real triple; swapped intentId or email → digest mismatch |
| plaintext storage (audit C1) | DB holds only `code_hash`; `code_hash` does not contain the code; code exists solely in the email body |
| TTL expiry | backdated `expires_at` → `403 INTENT_DEAD` (sweep formalizes status later — F10 single-writer) |
| replay, consumed + correct code | `201` existing booking (`replayed: true`, F4 idempotent repeat), still exactly 1 row per `booking-intent-<id>` |
| replay, consumed + WRONG code | `403 OTP_INVALID` — no booking tokens leak to an intentId holder |
| concurrent verify ×20 (STM, Risk 20) | 20/20 resolve, same `reservationId`, **exactly 1** `slot_reservations` row |
| concurrent DIFFERENT intents, same slot | 1 books, loser `409 SLOT_TAKEN` + intent `dead` (never re-armed) |
| resend rotation (F2) | same intentId, new code each time (4 distinct codes), `expiresAt` refreshed, old code → `OTP_INVALID`; 4th resend/10min → `429 RATE_LIMITED` |
| resend on consumed | `409 INTENT_CONSUMED`; on dead → `403 INTENT_DEAD` |

## Rate limits (F3 composite, independent buckets)

| Bucket | Limit | Verified |
|---|---|---|
| per-IP intent creation | 10 / 10 min | 11th distinct-email intent on one IP → `429 RATE_LIMITED` |
| per-email intent creation | 3 / 10 min | 4th intent on one email across distinct IPs → `429 RATE_LIMITED` |
| per-intent resend | 3 / 10 min | see matrix above |
| live cap per email | 2 pending | 3rd → `429 INTENT_CAP` (advisory `hashtext('booking_intent_'||email)`) |
