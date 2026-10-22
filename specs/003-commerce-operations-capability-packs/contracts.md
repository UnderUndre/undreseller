# Booking-First Service Template API Contracts (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Transport**: Next.js 15 App Router Route Handlers (`app/api/**`) + Internal Application Command/Query Ports (`lib/**`)

---

## 1. Staff Authentication, Session & Three-Role Access Contract (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

### 1.1. Authentication, Initial Bootstrap & Session Endpoints
- **Better Auth route mounting**: `app/api/auth/[...all]/route.ts` delegates the library's supported handlers to Next.js App Router (`lib/security/staffAuth.ts`). The application does not implement password hashing, session tokens, cookies, or session persistence itself.
- **Better Auth sign-in/sign-out**: Use the library's email/password endpoints (`/api/auth/sign-in/email`, `/api/auth/sign-out`). Better Auth verifies credentials, stores database-backed sessions through its PostgreSQL/Prisma adapter, and issues secure HTTP-only cookies. Configure a finite session lifetime and login rate limiting. Authentication errors are returned without revealing whether an email exists.
- **Initial `OWNER` Bootstrap (`scripts/bootstrap-owner.ts` or break-glass `ADMIN_TOKEN`)**:
  - Public sign-up is disabled at all times. On a fresh deployment with zero `OWNER` records, the initial `OWNER` is provisioned either via the idempotent CLI bootstrap script (`npx tsx scripts/bootstrap-owner.ts`) or by calling `POST /api/admin/staff` authenticated with `Authorization: Bearer <ADMIN_TOKEN>`.
- **Staff identity mapping**: After Better Auth validates the request session, `lib/security/staffAuth.ts` resolves the library user ID to exactly one `StaffMember.authUserId`, then checks `StaffMember.active` and applies the local three-role policy (`lib/security/staffRbac.ts`). A missing or inactive staff mapping rejects the request with `401 Unauthorized`; no role is trusted from the auth request body or session metadata.
- **`POST /api/admin/staff`** (`OWNER` only, or break-glass `ADMIN_TOKEN`):
  - **Input (Zod)**:
    ```typescript
    const ProvisionStaffSchema = z.object({
      email: z.string().email(),
      displayName: z.string().trim().min(2).max(120),
      role: z.enum(['OWNER', 'OPERATOR', 'PERFORMER']),
      resourceId: z.string().trim().min(1).max(64).optional(),
      initialPassword: z.string().min(12).max(128).optional(),
    });
    ```
  - **Behavior**: Provisions a Better Auth identity through its server-side API (using `initialPassword` when supplied or generating a cryptographically random 24-character temporary password returned once in the `201 Created` response for out-of-band handoff when no email integration is configured), creates its linked `StaffMember` (and optional `Resource` if `resourceId` is specified), and emits `AuditEvent` (`STAFF_MEMBER_PROVISIONED`). If either write fails, the operation compensates so there is no orphaned identity or staff record.
- **`POST /api/admin/staff/[id]/revoke-sessions`** (`OWNER` only):
  - **Input (Zod)**: `{ deactivateAccount: z.boolean().default(false), reason: z.string().trim().min(3).max(500) }`
  - **Behavior**: Uses Better Auth's server-side session-revocation API for the linked identity; sets `StaffMember.active = false` (and unpublishes any linked `ProfessionalProfile`) when `deactivateAccount = true`; emits `AuditEvent` (`STAFF_SESSIONS_REVOKED`). Subsequent staff requests from that identity are immediately rejected (`401`). Existing future `HELD`/`BOOKED` appointments assigned to that staff member's resource are preserved and surfaced in the staff booking view for `OWNER`/`OPERATOR` reassignment or customer-notified cancellation.
- Every successful staff mutation records the mapped `StaffMember.id` and its fixed `StaffRole` in `AuditEvent`. Better Auth credentials, temporary passwords, session values, cookies, and raw cancellation credentials are excluded from logs.

### 1.2. Static 3-Role Authorization Matrix (`requireStaffRole`)

```typescript
export type StaffActorContext = {
  actorId: string;           // StaffMember.id or "BREAK_GLASS_ADMIN_TOKEN"
  actorRole: 'OWNER' | 'OPERATOR' | 'PERFORMER';
  sessionId?: string;
  isBreakGlass: boolean;
};

export const ROLE_RANK: Record<StaffActorContext['actorRole'], number> = {
  PERFORMER: 1,
  OPERATOR: 2,
  OWNER: 3,
};
```

- **`PERFORMER` (`rank >= 1`)**:
  - `GET /api/admin/profiles` (returns own profile when `PERFORMER`), `PATCH /api/admin/profiles/[id]` (own profile and portfolio items only; cannot toggle business-level settings or edit another staff member's profile);
  - `GET /api/admin/bookings` (filtered to appointments assigned to the performer's `resourceId`); `PATCH /api/admin/bookings/[id]` only for status updates permitted on own assigned appointments (cannot approve/reject `OUT_CALL` coverage area, which requires `OPERATOR` or `OWNER`).
- **`OPERATOR` (`rank >= 2`)**:
  - All `PERFORMER` endpoints +
  - `POST /api/admin/profiles`, `PATCH /api/admin/profiles/[id]` (all professional profiles, publication toggles, and portfolio items);
  - `GET /api/admin/services`, `POST /api/admin/services`, `PATCH /api/admin/services/[id]`, `PUT /api/admin/hours`;
  - `GET /api/admin/bookings`, `PATCH /api/admin/bookings/[id]` (including `OUT_CALL` coverage confirmation/rejection, rescheduling, and cancellation across all business appointments).
- **`OWNER` (`rank === 3`)**:
  - All `OPERATOR` endpoints +
  - `POST /api/admin/staff`, `POST /api/admin/staff/[id]/revoke-sessions`
  - `PUT /api/admin/settings` (business branding, locale, timezone, currency confirmation/change, `IN_CALL` service address and public visibility flag, `OUT_CALL` coverage description, and `requireStaffApprovalForInCall`)
  - Manage every staff member, professional page, service, schedule, and appointment for the business; may also own a bookable `Resource` and `ProfessionalProfile`.
- **Break-Glass `ADMIN_TOKEN`**:
  - Accepted only via `Authorization: Bearer <ADMIN_TOKEN>` header (`lib/security/adminAuth.ts`); resolves to `{ actorId: "BREAK_GLASS_ADMIN_TOKEN", actorRole: "OWNER", isBreakGlass: true }` and writes an immutable `AuditEvent` (`action = "BREAK_GLASS_ADMIN_TOKEN_USED"`).

---

## 2. Appointment Availability Contract (`[MVP-CORE]` — `FR-307`, `FR-309`, `FR-338`)

```typescript
export type AvailabilityRequest = {
  serviceId: string;
  professionalId?: string;
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
  from: string; // YYYY-MM-DD or ISO-8601 date in business timeZone
  to: string;
};

export interface BookingPort {
  listAvailability(input: AvailabilityRequest): Promise<Array<{
    professionalId: string;
    resourceId: string;
    fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
    startsAt: string; // Customer-facing appointment start (UTC ISO-8601)
    endsAt: string;   // Customer-facing appointment end (UTC ISO-8601)
  }>>;

  createBooking(input: {
    serviceId: string;
    professionalId: string;
    fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
    serviceAddress?: string;
    startsAt: string;
    customerName: string;
    customerContact: string;
    customerNote?: string;
    idempotencyKey: string;
  }): Promise<{
    bookingId: string;
    status: 'PENDING' | 'CONFIRMED';
    price: { servicePriceMinor: string; travelFeeMinor: string; totalMinor: string; currency: string };
    location: { fulfillmentMode: 'IN_CALL' | 'OUT_CALL'; serviceAddress: string };
    cancellationUrl: string;
  }>;

  cancelBooking(input: { bookingId: string; actorId?: string; cancellationToken?: string; reason?: string }): Promise<void>;
}
```

`createBooking` recalculates the selected mode's price on the server and returns `{ bookingId, status, price, location, cancellationUrl }` only to the customer creating the booking. The `location` address is the submitted `OUT_CALL` address or the configured `IN_CALL` address, including when that business address is hidden from public pages. The customer must see and accept the current price before submission; the request never trusts a client-supplied amount. The random cancellation token is returned only once for the confirmation page; if an external notification is part of the signed client scope, that configured integration may deliver the same link. The raw token is never stored or logged.

---

## 3. Public Pages & Appointment Endpoints (`[MVP-CORE]`)

### 3.1. Public Business & Professional Pages
- `GET /api/public/business` returns published business details, active services (when `ShopSettings.currencyConfirmed = true`), configured locale/timezone/currency + `CurrencyMetadata`, and public contact links. It returns the exact `IN_CALL` address (`businessServiceAddress`) only when `businessServiceAddressPublic = true`; it returns `outCallCoverageDescription` when configured.
- `GET /api/public/professionals/[slug]` returns only an active staff member's published profile (`isPublished = true`, `staffMember.active = true`), published portfolio items (`isPublished = true`), and active services associated with that professional, including enabled location modes and corresponding price breakdowns. It never returns a customer's service address or private `IN_CALL` address.
- Unpublished profiles, deactivated staff profiles, drafts, customer identities, and appointment records MUST never appear in public responses (`404 Not Found` for unpublished/inactive profile slugs).

### 3.2. Appointment Availability (`GET /api/booking/slots`)
- **Input**: `serviceId`, date/range (`date` or `from`/`to`), optional `professionalId` (or `resourceId`), and enabled `fulfillmentMode` (`IN_CALL` | `OUT_CALL`).
- **Timezone & Buffer Behavior**:
  - Resolves `ShopSettings.timeZone` (IANA timezone) and converts the professional resource's `WeeklyHours` (`startMin`, `endMin`, `breakStartMin`, `breakEndMin`) and `AvailabilityException` (`date` in `YYYY-MM-DD` local business date, `isClosed`, `startMin`, `endMin`) from local business wall-clock minutes into UTC instants (skipping nonexistent spring-forward DST gaps and disambiguating fall-back overlaps deterministically).
  - Computes effective buffers: for `IN_CALL`, `effectiveBufferBeforeMin = bufferBeforeMin` and `effectiveBufferAfterMin = bufferAfterMin`; for `OUT_CALL`, `effectiveBufferBeforeMin = bufferBeforeMin + outCallTravelBeforeMin` and `effectiveBufferAfterMin = bufferAfterMin + outCallTravelAfterMin`.
  - Candidate appointment window `[startsAt, endsAt]` (where `endsAt = startsAt + durationMin`) requires the occupied resource window `[startsAt - effectiveBufferBeforeMin, endsAt + effectiveBufferAfterMin]` to fit within the working window without overlapping breaks or any active reservation (`status = 'BOOKED'` or `status = 'HELD' AND (holdExpiresAt IS NULL OR holdExpiresAt > now)`).
- **Concurrency**: `POST /api/booking` MUST acquire `acquireResourceSlotLock(tx, resourceId)` and enforce the PostgreSQL GiST exclusion constraint `slot_resource_no_overlap` across the buffered interval `[startsAt - effectiveBufferBeforeMin, endsAt + effectiveBufferAfterMin]`, returning `409 SLOT_UNAVAILABLE` if another request has already claimed an overlapping interval.

### 3.3. Create or Cancel a Booking
- **`POST /api/booking` input (Zod)**:
  ```typescript
  const CreateBookingSchema = z.object({
    serviceId: z.string().uuid(),
    professionalId: z.string().uuid(),
    fulfillmentMode: z.enum(['IN_CALL', 'OUT_CALL']),
    serviceAddress: z.string().trim().min(5).max(500).optional(),
    startsAt: z.string().datetime(),
    customerName: z.string().trim().min(1).max(120),
    customerContact: z.string().trim().min(3).max(160),
    customerNote: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  });
  ```
  - **Validation**: `serviceAddress` is required for `OUT_CALL` and forbidden for `IN_CALL` (`400 Bad Request`). The server validates that `ShopSettings.currencyConfirmed = true`, the service and professional (`StaffMember.active = true`, `ProfessionalProfile.isPublished = true`) are active, the mode is enabled on that service, and `ShopSettings.businessServiceAddress` is configured when `fulfillmentMode === 'IN_CALL'`. It recomputes the current price from trusted database settings and never accepts amounts or currency from the browser.
  - **Behavior**: Inside a serializable/locked transaction (`acquireResourceSlotLock`), verifies slot + buffer availability, creates the `Order` and `OrderItem` snapshot, and creates the `SlotReservation` with `fulfillmentMode`, `servicePriceMinor`, `travelFeeMinor`, `serviceAddressSnapshot`, `appointmentStartTime = startsAt`, `appointmentEndTime = endsAt`, `bufferBeforeMin = effectiveBufferBeforeMin`, `bufferAfterMin = effectiveBufferAfterMin`, `startTime = startsAt - effectiveBufferBeforeMin`, and `endTime = endsAt + effectiveBufferAfterMin`.
    - For `OUT_CALL`: always creates the booking as `status = 'PENDING'` (`Order.confirmationStatus = PENDING_STAFF_REVIEW`, `SlotReservation.status = HELD`, `holdExpiresAt = null`). An authenticated `OWNER` or `OPERATOR` confirms that the address is within coverage (`PATCH /api/admin/bookings/[id]` $\to$ `Order.confirmationStatus = STAFF_APPROVED`, `SlotReservation.status = BOOKED`) or rejects the request (`Order.status = CANCELLED`, `cancellationReason = STAFF_REJECTED`, `SlotReservation.status = RELEASED`, `cancellationTokenRevokedAt = now()`).
    - For `IN_CALL`: creates the booking directly as `status = 'CONFIRMED'` (`Order.confirmationStatus = STAFF_APPROVED`, `SlotReservation.status = BOOKED`, `holdExpiresAt = null`) unless `ShopSettings.requireStaffApprovalForInCall = true` (in which case it uses the same `PENDING` / `HELD` staff-approval state).
  - **Price rules**: `IN_CALL` uses `Item.priceMinor` and `travelFeeMinor = 0`. `OUT_CALL` uses `Item.outCallPriceMinor ?? Item.priceMinor`, then adds `Item.outCallTravelFeeMinor`. `Order.totalMinor` equals `servicePriceMinor + travelFeeMinor` in `ShopSettings.currency`. The response displays `servicePriceMinor`, `travelFeeMinor`, `totalMinor`, and `currency` separately. Later price or fee edits never rewrite stored booking snapshots (`INV-015`).

### 3.4. Business Location, Service Price & Booking Cancellation Endpoints
- **`PUT /api/admin/settings`** (`OWNER` only): updates business branding, locale, IANA `timeZone`, `currency` + `currencyConfirmed`, `businessServiceAddress`, `businessServiceAddressPublic`, `outCallCoverageDescription`, and `requireStaffApprovalForInCall`. An active service with `inCallEnabled = true` cannot be published until `businessServiceAddress` is non-empty, and no live service prices are exposed publicly until `currencyConfirmed = true`.
- **`PATCH /api/admin/services/[id]`** (`OWNER` or `OPERATOR`): updates enabled location modes (`inCallEnabled`, `outCallEnabled` — at least one must be `true` on an active service), standard `priceMinor`, optional `outCallPriceMinor`, `outCallTravelFeeMinor`, `bufferBeforeMin`, `bufferAfterMin`, `outCallTravelBeforeMin`, `outCallTravelAfterMin`, and `cancellationCutoffHours`. Every enabled mode must resolve to a non-negative integer amount in `ShopSettings.currency`.
- **`PATCH /api/admin/bookings/[id]`** (`OWNER`, `OPERATOR`, or assigned `PERFORMER` within role bounds):
  - `OWNER` and `OPERATOR` can confirm or reject pending `OUT_CALL` coverage (`action: 'APPROVE_COVERAGE' | 'REJECT_COVERAGE'`), reschedule, mark completed (`FULFILLED`), or cancel any booking.
  - `PERFORMER` can view only bookings on their own `resourceId` and mark their assigned confirmed booking completed, but cannot approve/reject `OUT_CALL` coverage or access other staff bookings (`403 Forbidden`).
- **`POST /api/booking/[id]/cancel`**:
  - **Customer input**: `{ token: string }`; a booking ID by itself never authorizes cancellation (`401`/`403`).
  - **Staff input**: an authenticated staff session with role authorization; no customer token is required.
  - **Credential & Link-Preview Safety Rules (`INV-014`)**: Generate a cryptographically random 32-byte token for one booking and the `CANCEL` action. Store only its SHA-256 hash in `SlotReservation.cancellationTokenHash` and set `cancellationTokenExpiresAt = appointmentStartTime`. Opening the customer `cancellationUrl` via `GET` MUST be strictly side-effect-free (rendering a confirmation UI without consuming the token or cancelling the booking, preventing accidental cancellation by Telegram/WhatsApp/email link-preview bots). On `POST /api/booking/[id]/cancel`, verify the token hash matches that booking, has not expired or been consumed/revoked, and `now <= appointmentStartTime - cancellationCutoffHours`, then transition the booking to `CANCELLED` / `RELEASED` and set `cancellationTokenConsumedAt = now()` in the same transaction. Revoke the token (`cancellationTokenRevokedAt = now()`) whenever the booking is rescheduled, completed, or cancelled by staff. Return a generic invalid/expired response and rate-limit attempts (`lib/security/rateLimiter.ts`).
  - **Link handling**: The confirmation/cancellation page submits the token in the `POST` JSON body, removes any token fragment from the address bar via `history.replaceState`, sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and loads no third-party analytics or scripts. Redact `token` and `cancellationUrl` from all logs and error reports.
  - **Audit**: Staff cancellation writes `AuditEvent` with `actorId = StaffMember.id` and `actorRole`; public cancellation writes `AuditEvent` with `actorId = "CUSTOMER_CANCELLATION_LINK"` without logging the raw token. Replays are idempotent/rejected without mutating state.

---

## 4. Staff Booking & Profile Views (`[MVP-CORE]` — `FR-326`, `INV-010`)

Staff views return customer contact details only to roles that need them to manage the booking. Public responses and structured logs contain no raw customer contact details. `PERFORMER` views are filtered to the authenticated professional's own profile and assigned bookings.

```typescript
export type StaffBookingView = {
  bookingId: string;
  serviceName: string;
  professionalId: string;
  resourceId: string;
  startsAt: string; // appointmentStartTime ?? startTime
  endsAt: string;   // appointmentEndTime ?? endTime
  occupiedStartsAt: string; // startTime (includes effective before-buffer)
  occupiedEndsAt: string;   // endTime (includes effective after-buffer)
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  customerName: string;
  customerContact: string;
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL' | null; // Null for legacy bookings with no recorded mode
  serviceAddress: string | null; // Confidential; returned only to authorized staff for this booking
  servicePriceMinor: string | null; // Null for legacy bookings without a snapshot
  travelFeeMinor: string | null; // Null for legacy bookings without a snapshot
  totalMinor: string;
  currency: string | null; // Null only when the legacy booking has no linked currency value
};

export type PublicProfessionalView = {
  slug: string;
  displayName: string;
  headline: string | null;
  biography: string | null;
  photoUrl: string | null;
  portfolioItems: Array<{ id: string; title: string; description: string | null; mediaUrl: string; sortOrder: number }>;
  services: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    durationMin: number;
    priceOptions: Array<{
      fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
      servicePriceMinor: string;
      travelFeeMinor: string;
      totalMinor: string;
      currency: string;
    }>;
  }>;
};
```

The staff-view `PENDING` status maps to `Order.confirmationStatus = PENDING_STAFF_REVIEW` (with `SlotReservation.status = HELD`); `CONFIRMED` maps to `STAFF_APPROVED` or `CLIENT_CONFIRMED` (with `SlotReservation.status = BOOKED`); `CANCELLED` maps to `Order.status = CANCELLED` (`SlotReservation.status = RELEASED`); `COMPLETED` maps to `Order.status = FULFILLED`. Do not add a separate location-review status enum for `003.1`.

---

## 5. Subsequent Phase SPI, Operations & Portfolio AI Gateway Contracts (`[PHASE-PACK]` & `[AI-LAB]`)

- **Operator-Approved Suggestions & Limited-Connectivity Draft Reconcile (`Phase E` — `FR-306`, `FR-322`, `FR-323`, `FR-324`)**:
  - `POST /api/admin/conversations/to-draft`: validates catalog prices and capacity and creates an operator-approved draft (`Quote Draft`, `Cart Draft`, `Booking Draft`, `Payment Request`, `Order Amendment Proposal`).
  - `POST /api/admin/drafts/reconcile`: reconciles queued non-financial offline drafts (`PartyNote`, `CompletionEvidence`, draft quotes) against current server state (`scheduleVersion` / `updatedAt`), rejecting any attempt at offline payment capture or offline final slot locking (`FR-324`).
- **Narrow Compliance Ports & Client Readiness Gate (`Phase F` — `FR-328`–`FR-330`, `lib/packs/compliance/complianceRegistry.ts`)**:
  - `TaxQuoteProvider`, `FiscalReceiptProvider`, `ElectronicInvoiceProvider`, `ProductComplianceProvider`, `TransportDocumentProvider`. Post-payment failures never roll back `PaymentEvent`; they enqueue an `OperatorAction` (`COMPLIANCE_PROVIDER_FAILURE`, `INV-J05`).
  - `evaluateFeatureFitManifest(manifest)`: non-legal deployment feature-fit validator (`FR-329`) outputting required adapters, missing-provider warnings, and `NOT_COMPLIANCE_READY` status until `POST /api/admin/compliance/sign-off` is executed by `OWNER` (`FR-330`, `INV-J06`).
- **`LanguageModelGateway` (`Phase H` — `lib/ai/gateway.ts`)**:
  - OpenAI-compatible wire contract (`POST /v1/chat/completions`, `POST /v1/embeddings`, `GET /v1/models`) routed through `OmniRoute` to local `LM Studio` and allowlisted official APIs (`allowedProviderClasses: ['local', 'official-api-key']`).
  - Enforces `AiDataClass` routing (`CONFIDENTIAL` $\to$ `local` only, fail-closed with `AI_ROUTE_UNAVAILABLE_FAIL_CLOSED` if `LM Studio` is down) and emits PII-free `AiTelemetryRecord` metrics (`NFR-306`, `NFR-307`).
