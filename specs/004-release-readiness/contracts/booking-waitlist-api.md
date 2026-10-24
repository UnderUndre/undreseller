# Contract: Booking & Waitlist API (FR-403/408/419–433)

## Endpoints (deltas; existing routes keep their contracts)

### POST /api/booking — FSM semantics
Request adds nothing new; response includes `reservation.status` ∈ {CONFIRMED, PENDING_APPROVAL, HELD}. Zod refine: `fulfillmentMode === 'OUT_CALL'` requires `serviceAddress` (field-level 400 at boundary, FR-425). Item duration must be 15-min quantum (FR-442). If `item.requiresFullPrepayment` → HELD + invoice via PaymentProvider (prepaid track); else FREE track per instance approval flag.

### GET /api/booking/slots — timezone + reasons
Query: `?itemIds&resourceId&anyAvailable=false`. Slots computed in `ShopSettings.timeZone` (IANA, DST-correct, FR-408). Response slot objects gain `unavailableReason?: 'booked' | 'break'` for grid explanation. `anyAvailable=true`: ordering = soonest valid slot across masters minimizing sub-quantum gaps (deterministic greedy, FR-421).

### POST /api/waitlist — join (FR-419)
`{ serviceId?, professionalProfileId?, windowStartAt, windowEndAt }` (auth: **Telegram identity required at launch** — contact-only callers receive 422 with guidance; offers are Telegram-only). Limits: ≤1 ACTIVE per (customer, service, window-day); window ≤ 30d; rate-limited.

### POST /api/waitlist/claim — atomic single-winner (FR-420/433)
`{ offerToken }` (32-byte token from the TG offer message). Flows through the standard booking transaction: first COMMIT wins → `{ status: 'CLAIMED', booking }`; loser → `{ status: 'TAKEN' }`; expired → `410`. Free service → immediate CONFIRMED; prepaid → HELD (15-min payment TTL).

### Events (Inngest / inbox)
`booking.cancelled { reservationId, itemId, resourceId, windowStart/End }` → waitlist fan-out job (batch ≤10, dispatch p95 ≤ 60s, fallback deadlineSweeper).

## Contract tests
- 100 concurrent same-slot POSTs → exactly one 2xx CONFIRMED/HELD, 99 structured 409s (SC-401).
- Two concurrent claims on one offer → one CLAIMED, one TAKEN.
- DST-boundary day → wall-clock slots match business hours.
- Mixed cart service+product → 422 with split guidance (FR-426).
