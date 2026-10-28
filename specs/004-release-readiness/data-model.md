# Data Model: 004 Release Readiness

> Companion to `spec.md` (FR-401..443) and `plan.md`. DDL sketches are indicative; Prisma schema is the source of truth. Migration: `20261025000000_004_release_readiness_expand` (Phase 1, additive only).

## 1. Entities

### 1.1 SlotReservation (MODIFIED — FSM columns + enum)

Existing table (003). Changes:

| Change | Type | Classification | Notes |
|---|---|---|---|
| `status` enum ADD VALUE | `PAYMENT_PENDING`, `UNDERPAID`, `PENDING_APPROVAL`, `CANCELLED`, `STAFF_REJECTED` | Internal | `ALTER TYPE "ReservationStatus" ADD VALUE ...` (expand-safe, irreversible — deployed before code writes it); existing values HELD/BOOKED/RELEASED. **Name-mapping (antigravity F1): the DB type is `"ReservationStatus"` (NOT `SlotReservationStatus`); spec-level `CONFIRMED` maps to the existing DB value `BOOKED` — no new CONFIRMED value is added; FSM code translates at the service boundary.** |
| `holdFrozenAt` | `timestamptz NULL` | Internal | Set on first gateway `confirming`; freezes TTL sweep; **hard ceiling MAX_CONFIRMING_FREEZE = 24 h — past it the hold expires, slot releases, order → FR-432 resolution** |
| (unchanged) price/buffer/address snapshots | — | Financial/PII | Already exist from 003 — booking snapshotting is DONE (audit-verified) |

Validation: FSM transitions only through `lib/kernel/bookingFsm.ts` (pure function + service guard). Classification: PII (address snapshot), Financial (price snapshots).

### 1.2 PaymentProviderContract (code contract + config — NOT a table)

- Interface: `createInvoice({ orderId, amountMinor, currency, callbackBaseUrl }) → { providerPaymentId, paymentUrl }`; `verifyCallback(rawBody, signature) → boolean`; `parseCallback(rawBody) → { providerPaymentId, orderId, status: waiting\|confirming\|finished\|partially_paid\|failed\|expired, paidMinor, quotedMinor }`; capabilities.
- Registry: deployment configuration selects enabled providers (FR-401). Adapters: `nowpayments.ts` (invoice API via `POST /v1/invoice`, server-side, replaces hand-built URL), `stars.ts` (existing flow behind contract).
- Existing `InboxEvent` idempotency (UNIQUE eventId) remains the dedup layer (FR-406). `PaymentAllocationLink` (new table, nullable-safe): `id, orderId, provider, providerPaymentId, allocationKind, createdAt` — explicit ledger link when a payment lands (pre-structure for 003.2 PaymentAllocation without implementing plans).

### 1.3 WaitlistEntry (NEW)

| Field | Type | Classification |
|---|---|---|
| id | uuid PK | — |
| customerTgId / customerContact | text | PII |
| serviceId | FK Item, nullable | Internal |
| professionalProfileId | FK, nullable | Internal |
| windowStartAt / windowEndAt | timestamptz | Internal |
| status | `ACTIVE`, `NOTIFIED`, `FULFILLED`, `EXPIRED`, `CANCELLED` | Internal |
| createdAt | timestamptz | Internal |

Uniqueness: one ACTIVE entry per (customer, service, day-window). Validation: window ≤ 30 days ahead. Volume bound: ≤ 200 ACTIVE per instance (rate-limited join). **Anti-spam (FR-419): ≤ 10 ACTIVE entries per user; offer caps ≤1/user/24h, ≤3/user/day enforced at fan-out. Retention: FULFILLED/EXPIRED/TAKEN offers and closed entries purged on the 90-day retention cycle and on GDPR user deletion (FR-428).**

### 1.4 WaitlistOffer (NEW)

`id, waitlistEntryId FK, slotReservationId FK, offerTokenHash, status (SENT/CLAIMED/TAKEN/EXPIRED), sentAt, claimedAt`. Claim flow: offer token (32-byte, SHA-256 stored — same pattern as cancellation token) → atomic booking through the standard booking path → first COMMIT wins; concurrent claimants get `TAKEN`. Batch bound per cancellation: ≤ 10 offers. TTL: free service → claim = immediate booking; prepaid → HELD under the 15-min payment TTL (FR-433).

### 1.5 CustomBookingField (NEW) / BookingFieldAnswer (NEW)

CustomBookingField: `id, instanceScoped, key (slug), label, type (TEXT\|NUMBER\|SINGLE_SELECT\|CHECKBOX), required, optionsJson (for select), boundItemIds (nullable array — per-service binding), sortOrder, archivedAt NULL, createdAt`. Deactivation only (FR-423): archivedAt set → hidden from new bookings; historical answers keep a definition snapshot (`labelSnapshot`, `typeSnapshot` inside the answer row). Bound: ≤ 10 active fields per instance.

BookingFieldAnswer: `id, slotReservationId FK, fieldId FK, labelSnapshot, typeSnapshot, valueText (≤1000 chars) / valueNumber / valueBool`. Classification: PII (may contain customer-entered data). Purged with the booking's retention purge.

### 1.6 NotificationDeliveryLog (NEW)

`id, bookingRefId, orderId (nullable), channel (TELEGRAM\|EMAIL), target (redacted hash, not raw PII), status (ACCEPTED\|FAILED), providerRef, errorCode (nullable), attemptAt, latencyMs`. No `delivered` state — Telegram bots cannot confirm delivery (FR-409). Retention: 90 days (nightly purge). Classification: Internal (target stored as salted hash).

### 1.7 SlugRedirect (NEW)

`oldSlug (PK), profileId FK, createdAt`. Lookup on `/professionals/[slug]` 404-path before returning 404 → 301 (FR-437). Alternative rejected: mutable-slug-without-redirect (research pitfall #3).

### 1.8 ShopSettings (MODIFIED) + Item (MODIFIED)

- ShopSettings += `defaultLocale TEXT NULL` ('ru'|'en'), `enabledLocales TEXT[] NULL`, `slotGridStepMin INT NULL DEFAULT 30` (15|30), email/payout reference fields remain OWNER-gated (FR-438 — RBAC split is service-level, not schema).
- Item += `requiresFullPrepayment BOOLEAN NOT NULL DEFAULT false` (per-service prepayment toggle, FR-407), `archivedAt timestamptz NULL` (soft delete, FR-436), `sortOrder INT NOT NULL DEFAULT 0` (arrow reordering).
- Item.durationMin validation moves to 15-minute quantum (zod `refine(v => v % 15 === 0)`); existing rows grandfathered (backfill quantizes or leaves with warning — plan decision: leave legacy rows, admin edit enforces quantum).

### 1.9 User language preference

`customerTgId → languageOverride TEXT NULL` on the existing customer/user projection (lightweight upsert table `UserPreference (tgId PK, languageOverride, updatedAt)`). Resolution: override > Telegram `language_code` > ShopSettings.defaultLocale (FR-412). Anonymous web: session cookie until identified.

## 2. State Machines

### 2.1 Booking FSM (two-track — spec US1)

```
FREE:    AVAILABLE → CONFIRMED                    (IN_CALL, auto — unless instance approval flag)
         AVAILABLE → PENDING_APPROVAL → CONFIRMED  (OUT_CALL always; IN_CALL when flag on)
         PENDING_APPROVAL → AVAILABLE              (staff reject / customer cancel)
PREPAID: AVAILABLE → HELD (TTL 15m) → PAYMENT_PENDING → CONFIRMED
         HELD|PAYMENT_PENDING → AVAILABLE          (TTL expired / gateway failed|expired)
         PAYMENT_PENDING → UNDERPAID               (partially_paid; staff resolution; no auto-confirm)
         PAYMENT_PENDING (frozen on confirming)    (holdFrozenAt set; TTL suspended)
         late finished after re-book → order PAID_REQUIRES_RESOLUTION + RefundOperation(SLA 24h)  [existing path, codified FR-432]
```

Transactional boundary: transitions execute inside `acquireResourceSlotLock` + GiST constraint transaction (existing pattern). ACID.

### 2.2 Waitlist offer lifecycle

`SENT → CLAIMED (first atomic booking) | TAKEN (loser) | EXPIRED (window passed, silent)`. No privileged reservation (FR-420).

### 2.3 Custom field lifecycle

`ACTIVE → ARCHIVED (archivedAt)` — no DELETE; answers immutable snapshots; purged only via booking retention.

## 3. Expand/Contract Manifest (Constitution X)

| Phase | Artifact | Content |
|---|---|---|
| 1 Expand | `20261025000000_004_release_readiness_expand/migration.sql` (+down.sql) | CREATE TABLE WaitlistEntry, WaitlistOffer, CustomBookingField, BookingFieldAnswer, NotificationDeliveryLog, SlugRedirect, PaymentAllocationLink, UserPreference; ALTER TYPE "ReservationStatus" ADD VALUE (separate statement, not in a transaction that uses it); ALTER TABLE Item ADD requiresFullPrepayment/archivedAt/sortOrder; ShopSettings ADD defaultLocale/enabledLocales/slotGridStepMin; CREATE INDEX on WaitlistEntry(status, windowStartAt), NotificationDeliveryLog(attemptAt), SlugRedirect(PK). All additive, nullable/defaulted — old code runs unchanged. |
| 2 Dual-Write & Backfill | `scripts/backfill-004-language-defaults.ts` | Idempotent: set defaultLocale from existing config heuristic; copy Item.isActive → (no-op, archivedAt stays null); rate-limited batches. No legacy-column shadowing otherwise. |
| 3 Cutover | feature flags in `lib/config/integrationProfile.ts` | Reads switch to FSM/payment-provider/waitlist paths; watch p95/p99 + error budget (zero regression per NFR-401). |
| 4 Contract | 005-scheduled | Remove legacy hand-built payment URL branch, ×100 arithmetic, `/api/booking/lock` vs `/api/booking` consolidation review. No destructive DDL this release (enum ADD VALUE irreversible-by-design, harmless unused on rollback). |

Rollback: per-phase down.sql drops new tables/columns (safe — additive only); feature-flag killswitch restores legacy reads without DDL; enum values left in place (inert).
