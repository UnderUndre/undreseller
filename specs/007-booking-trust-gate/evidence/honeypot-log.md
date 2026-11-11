# Evidence: Honeypot (SC-002, FR-703) + perf (NFR-703)

## SC-002 honeypot

| Case | Result |
|---|---|
| filled `companyWebsite` | `honeypotFilled` → true → silent `200 {ok:true}`, ZERO domain effects (no intent, no booking, no email) |
| whitespace-only value | false (passes through) |
| field absent | false (human path) |
| audit | `honeypot.hit` per hit, aggregate `BOOKING`/`WAITLIST`, metadata `{route}` — no IP (NFR-704 PII deny-list) |
| a11y | both forms: `aria-hidden="true"` + `tabIndex={-1}` + `autoComplete="off"` + CSS-hidden (`audit M2` canon) |
| coverage | booking route + waitlist route + booking resend route; forms: SlotGrid panel + WaitlistJoinForm |

## NFR-703 perf (service-level, local docker `undreseller_test`, 2026-11-11)

Measured with a temporary spike (deleted — spike disposal canon): 50 sampled
createIntent/verifyIntentBooking calls, 5 warmups excluded, instant fake
transport (service cost, not network).

| Path | p50 | p95 | Budget | Verdict |
|---|---|---|---|---|
| intent create (FULL path: 002 grid resolve + advisory trx + email delivery-log) | 37–41 ms | 54–64 ms | 30 ms | **FAIL (strict full-path reading)** |
| intent verify (HMAC + attempts CAS + full createBooking FSM + advisory) | 20–23 ms | 35–39 ms | 50 ms | **PASS** |

### Honest analysis

The create budget is exceeded by the parts 007 did NOT add latency to:

1. `resolveAvailability` (spec 002 canon) — ~5–7 sequential queries
   (product, settings, resource, weekly-hours, exceptions, busy) ≈ 35 ms —
   the grid validation required by FR-702/D3 rides on it;
2. `logDelivery` write (003 canon) ≈ 5 ms.

The HMAC+advisory core itself is single-digit ms (verify proves the order of
magnitude: it does MORE work — full FSM booking — and still fits 35 ms).

**Flag for `/speckit.code-review`**: either (a) re-scope the NFR-703 create
budget to the core path (as its own parenthetical suggests), or (b) accept the
full-path budget and parallelize the independent fetches in
`resolveAvailability` (out-of-spec change to 002 code). Deliberately NOT
papered over with a reinterpretation.
