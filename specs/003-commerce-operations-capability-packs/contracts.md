# Booking-First Service Template API Contracts (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Transport**: Next.js 15 App Router Route Handlers (`app/api/**`) + Internal Application Command/Query Ports (`lib/**`)

---

## 1. Staff Authentication, Session & Three-Role Access Contract (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

### 1.1. Authentication & Session Endpoints
- **Better Auth route mounting**: `app/api/auth/[...all]/route.ts` delegates the library's supported handlers to Next.js App Router. The application does not implement password hashing, session tokens, cookies, or session persistence itself.
- **Better Auth sign-in/sign-out**: Use the library's email/password endpoints. Better Auth verifies credentials, stores database-backed sessions through its PostgreSQL/Prisma adapter, and issues secure HTTP-only cookies. Configure a finite session lifetime and login rate limiting. Authentication errors are returned without revealing whether an email exists.
- **Staff identity mapping**: After Better Auth validates the request session, the application resolves the library user ID to exactly one `StaffMember.authUserId`, then checks `StaffMember.active` and applies the local three-role policy. A missing or inactive staff mapping rejects the request; no role is trusted from the auth request body or session metadata.
- **`POST /api/admin/staff`** (`OWNER` only):
  - **Input (Zod)**: `{ email: z.string().email(), displayName: z.string().min(2), role: z.enum(['OWNER', 'OPERATOR', 'PERFORMER']), resourceId: z.string().optional() }`
  - **Behavior**: Provisions a Better Auth identity through a server-side library API, creates its linked `StaffMember`, and emits `AuditEvent` (`STAFF_MEMBER_PROVISIONED`). If either write fails, the operation compensates so there is no orphaned identity or staff record. Public sign-up remains disabled.
- **`POST /api/admin/staff/[id]/revoke-sessions`** (`OWNER` only):
  - **Input (Zod)**: `{ deactivateAccount: z.boolean().default(false), reason: z.string().min(3) }`
  - **Behavior**: Uses Better Auth's server-side session-revocation API for the linked identity; sets `StaffMember.active = false` when requested; emits `STAFF_SESSIONS_REVOKED`. The next staff request is rejected even if a stale client cookie remains.
- Every successful staff mutation records the mapped `StaffMember.id` and its fixed `StaffRole`. Better Auth credentials, session values, cookies, and raw cancellation credentials are excluded from logs.

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
  - `GET /api/admin/profile/me` and profile/portfolio update commands for the authenticated member only;
  - View own availability and assigned appointments; update booking status only where allowed by business policy.
- **`OPERATOR` (`rank >= 2`)**:
  - All `PERFORMER` endpoints +
  - Manage services, public professional pages, portfolio entries, schedules, and business appointments within assigned business permissions.
- **`OWNER` (`rank === 3`)**:
  - All `OPERATOR` endpoints +
  - `POST /api/admin/staff`, `POST /api/admin/staff/[id]/revoke-sessions`
  - `PUT /api/admin/settings` (business branding, locale, timezone, currency, and booking defaults)
  - Manage every staff member, professional page, service, schedule, and appointment for the business.
- **Break-Glass `ADMIN_TOKEN`**:
  - Accepted only via `Authorization: Bearer <ADMIN_TOKEN>` header; resolves to `{ actorId: "BREAK_GLASS_ADMIN_TOKEN", actorRole: "OWNER", isBreakGlass: true }` and writes an immutable `AuditEvent` (`action = "BREAK_GLASS_ADMIN_TOKEN_USED"`, `severity = "CRITICAL"`).

---

## 2. Appointment Availability Contract (`[MVP-CORE]` — `FR-307`, `FR-309`)

```typescript
export type AvailabilityRequest = {
  serviceId: string;
  professionalId?: string;
  from: string; // ISO-8601 date/time
  to: string;
};

export interface BookingPort {
  listAvailability(input: AvailabilityRequest): Promise<Array<{
    professionalId: string;
    startsAt: string;
    endsAt: string;
  }>>;

  createBooking(input: {
    serviceId: string;
    professionalId: string;
    startsAt: string;
    customerName: string;
    customerContact: string;
    idempotencyKey: string;
  }): Promise<{ bookingId: string; status: 'PENDING' | 'CONFIRMED'; cancellationUrl: string }>;

  cancelBooking(input: { bookingId: string; actorId?: string; cancellationToken?: string; reason?: string }): Promise<void>;
}
```

`createBooking` returns `{ bookingId, status, cancellationUrl }`. The random cancellation token is returned only once for the confirmation page; if an external notification is part of the signed client scope, that configured integration may deliver the same link. The raw token is never stored or logged.

---

## 3. Public Pages & Appointment Endpoints (`[MVP-CORE]`)

### 3.1. Public Business & Professional Pages
- `GET /api/public/business` returns published business details, active services, configured locale/timezone/currency, and public contact links.
- `GET /api/public/professionals/[slug]` returns only a published profile, published portfolio items, and services associated with that professional.
- Unpublished profiles, drafts, customer identities, and appointment records MUST never appear in public responses.

### 3.2. Appointment Availability (`GET /api/booking/slots`)
- **Input**: `serviceId`, date range, optional `professionalId`.
- **Behavior**: Resolves duration and buffers from the service, working hours and exceptions from the professional's resource, and timezone from business settings. Returns only slots that remain available after existing bookings.
- **Concurrency**: `POST /api/booking` MUST acquire the resource/slot lock and return `409 SLOT_UNAVAILABLE` if another request has already booked the interval.

### 3.3. Create or Cancel a Booking
- **`POST /api/booking` input (Zod)**:
  ```typescript
  const CreateBookingSchema = z.object({
    serviceId: z.string().uuid(),
    professionalId: z.string().uuid(),
    startsAt: z.string().datetime(),
    customerName: z.string().min(1).max(120),
    customerContact: z.string().min(3).max(160),
    customerNote: z.string().max(500).optional(),
    idempotencyKey: z.string().min(8).max(128),
  });
  ```
  - **Behavior**: validates that the service and professional are active, the profile is published or the business accepts direct bookings, and the requested slot is still available; creates the booking and writes a staff audit event. This flow does not create a product order or require payment.
- **`POST /api/booking/[id]/cancel`**:
  - **Customer input**: `{ token: string }`; a booking ID by itself never authorizes cancellation.
  - **Staff input**: an authenticated staff session with role authorization; no customer token is required.
  - **Credential rules**: Generate a cryptographically random 32-byte token for one booking and the `CANCEL` action. Store only its SHA-256 hash in nullable fields on the existing `SlotReservation`; set expiry to the appointment start time. On cancellation, verify the token hash matches that booking, has not expired or been consumed/revoked, the booking is cancellable under its configured cutoff, then consume the credential in the same transaction as the cancellation. Revoke it when the booking is rescheduled, completed, or cancelled. Return a generic invalid/expired response and rate-limit attempts.
  - **Link handling**: The confirmation page submits the token in the POST body, then removes it from the address bar. Cancellation responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; the page loads no third-party analytics or assets. Redact the token from access logs and error reports.
  - **Audit**: Staff cancellation records the staff actor; public cancellation records a customer-link action without logging the token. Replays do not change the booking.

---

## 4. Staff Booking & Profile Views (`[MVP-CORE]` — `FR-326`, `INV-010`)

Staff views return customer contact details only to roles that need them to manage the booking. Public responses and structured logs contain no raw customer contact details. `PERFORMER` views are filtered to the authenticated professional's own profile and assigned bookings.

```typescript
export type StaffBookingView = {
  bookingId: string;
  serviceName: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  customerName: string;
  customerContact: string;
};

export type PublicProfessionalView = {
  slug: string;
  displayName: string;
  headline: string | null;
  biography: string | null;
  photoUrl: string | null;
  portfolioItems: Array<{ title: string; description: string | null; mediaUrl: string }>;
  services: Array<{ id: string; name: string; durationMin: number; priceMinor: string; currency: string }>;
};
```

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
