# Phase 1 Interface & API Contracts (`003-commerce-operations-capability-packs`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-21  
**Spec**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Transport**: Next.js 15 App Router Route Handlers (`app/api/**`) + Internal Application Command/Query Ports (`lib/**`)

---

## 1. Staff Authentication, Session & 3-Role RBAC Contract (`[MVP-CORE]` — `FR-325a`, `FR-325b`)

### 1.1. Authentication & Session Endpoints
- **`POST /api/admin/auth/login`**:
  - **Input (Zod)**: `{ email: z.string().email(), password: z.string().min(8).max(128) }`
  - **Behavior**: Verifies `StaffMember.active === true` and `scrypt` password hash; creates `StaffSession` (`tokenHash = sha256(token)`, 14-day TTL); sets `HttpOnly; Secure; SameSite=Lax; Path=/` cookie `undre_staff_session`; writes `AuditEvent` (`STAFF_LOGIN_SUCCESS`, `actorId = staffMember.id`, `actorRole = staffMember.role`).
  - **Errors**: `401 INVALID_CREDENTIALS`, `403 STAFF_ACCOUNT_INACTIVE`, `429 RATE_LIMITED`.
- **`POST /api/admin/auth/logout`**:
  - **Behavior**: Sets `StaffSession.revokedAt = now()`, clears cookie, writes `AuditEvent` (`STAFF_LOGOUT`).
- **`POST /api/admin/staff`** (`OWNER` only):
  - **Input (Zod)**: `{ email: z.string().email(), displayName: z.string().min(2), role: z.enum(['OWNER', 'OPERATOR', 'PERFORMER']), telegramUserId: z.string().optional(), resourceId: z.string().optional(), initialPassword: z.string().min(10) }`
  - **Behavior**: Creates or updates `StaffMember` (no public self-registration allowed); emits `AuditEvent` (`STAFF_MEMBER_PROVISIONED`).
- **`POST /api/admin/staff/[id]/revoke-sessions`** (`OWNER` only):
  - **Input (Zod)**: `{ deactivateAccount: z.boolean().default(false), reason: z.string().min(3) }`
  - **Behavior**: Immediately sets `revokedAt = now()` on all active `StaffSession` rows for `staffMemberId` (and `active = false` if `deactivateAccount === true`). Subsequent HTTP calls return `401 SESSION_REVOKED`, and Telegram Staff Bot callbacks from `telegramUserId` return `403 ACCESS_DENIED`.

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
  - `GET /api/admin/fulfillment/my-segments` (view assigned `FulfillmentSegment` & `WorkingSchedule`)
  - `POST /api/admin/fulfillment/segments/[id]/evidence` (upload `CompletionEvidence` & mark assigned segment completed)
  - `POST /api/admin/drafts/reconcile` (reconcile offline non-financial drafts for assigned segments/notes — `FR-324`)
  - Staff Bot callback: `staff:fulfill:<orderId>:<scheduleVersion>` (only for orders/segments assigned to this performer's `resourceId` or if `actorRole >= OPERATOR`).
- **`OPERATOR` (`rank >= 2`)**:
  - All `PERFORMER` endpoints +
  - `GET /api/admin/operator-actions` (`OperatorActionView` work queue)
  - `POST /api/admin/operator-actions/[id]/resolve` (execute safe resolution actions)
  - `GET /api/admin/orders` (`OrderSummaryView`), `GET /api/admin/parties/[id]/timeline` (`PartyTimelineView`), `GET /api/admin/cash-commitments` (`CashCommitmentView`)
  - `POST /api/admin/catalog/offerings` & `PATCH /api/admin/catalog/offerings/[id]`
  - `POST /api/admin/inventory/movements` (`ADJUSTMENT`, `RETURN`, `DAMAGE`)
  - `POST /api/admin/orders/[id]/refund` (policy-bounded refunds)
  - `POST /api/admin/conversations/to-draft` (`FR-322`), `POST /api/admin/suggestions/[id]/approve` (`FR-306`)
  - Staff Bot callbacks: `staff:approve`, `staff:reject`, `staff:reschedule`, `staff:blacklist`, `staff:copy_contacts`.
- **`OWNER` (`rank === 3`)**:
  - All `OPERATOR` endpoints +
  - `POST /api/admin/staff`, `POST /api/admin/staff/[id]/revoke-sessions`
  - `PUT /api/admin/settings` (deployment & capability pack configuration)
  - `POST /api/admin/compliance/sign-off` (`FR-330` Client Compliance Readiness Gate sign-off `NOT_COMPLIANCE_READY -> COMPLIANCE_READY`)
  - `POST /api/admin/users/purge`, `POST /api/admin/orders/[id]/purge`, `POST /api/admin/users/unblock`
  - `POST /api/admin/quotes/[id]/approve-margin` (`MarginGuard` override in `Phase C`)
  - `POST /api/admin/imports/[id]/commit` (`ImportBatch` commit in `Phase E`).
- **Break-Glass `ADMIN_TOKEN`**:
  - Accepted only via `Authorization: Bearer <ADMIN_TOKEN>` header; resolves to `{ actorId: "BREAK_GLASS_ADMIN_TOKEN", actorRole: "OWNER", isBreakGlass: true }` and writes an immutable `AuditEvent` (`action = "BREAK_GLASS_ADMIN_TOKEN_USED"`, `severity = "CRITICAL"`).

---

## 2. Unified Capacity Contract (`[MVP-CORE]` — `FR-307`–`FR-309`)

```typescript
export type CapacityItemRequest = {
  offeringId: string;
  variantId?: string;
  quantity: number;
  resourceId?: string;
  desiredStartTime?: string; // ISO-8601 for SERVICE / APPOINTMENT
};

export interface CapacityPort {
  checkCapacity(input: {
    items: CapacityItemRequest[];
    date?: string;
    resourceId?: string;
  }): Promise<{
    available: boolean;
    stockStatus: Array<{ variantId: string; availableQty: number; sufficient: boolean }>;
    candidateWindows: Array<{ startTime: string; endTime: string; resourceId: string; totalDurationMin: number }>;
  }>;

  reserveCapacity(input: {
    orderId: string;
    items: CapacityItemRequest[];
    actorId: string;
    idempotencyKey: string;
  }): Promise<{
    inventoryMovements: string[];
    reservations: string[];
  }>;

  commitCapacity(input: {
    orderId: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<void>;

  releaseCapacity(input: {
    orderId: string;
    segmentIds?: string[]; // Supports partial cancellation (US7 / FR-314)
    reason: string;
    actorId: string;
    idempotencyKey: string;
  }): Promise<void>;
}
```

---

## 3. Checkout, PaymentPlan & Segmented Fulfillment Endpoints (`[MVP-CORE]`)

### 3.1. Mixed Basket Checkout (`POST /api/checkout`)
- **Input (Zod)**:
  ```typescript
  const CheckoutRequestSchema = z.object({
    orderId: z.string().uuid().optional(), // Existing service hold orderId or omitted for pure product/mixed cart
    items: z.array(z.object({
      offeringId: z.string().uuid(),
      variantId: z.string().uuid().optional(),
      quantity: z.number().int().min(1).max(100),
    })).min(1).max(10).optional(),
    customerName: z.string().min(1).max(120).optional(),
    customerPhone: z.string().min(5).max(32).optional(),
    customerEmail: z.string().email().optional(),
    customerTgUsername: z.string().max(64).optional(),
    hasWhatsApp: z.boolean().optional(),
    hasTelegram: z.boolean().optional(),
    customerNotes: z.string().max(1000).optional(),
    paymentMethod: z.enum(['STARS', 'CRYPTO', 'PAY_ON_SITE']),
    paymentPlanMode: z.enum(['FULL', 'DEPOSIT_30_70']).default('FULL'),
    idempotencyKey: z.string().min(8).max(128),
  });
  ```
- **Transactional Guarantees**:
  1. Resolves or creates `Party`, `PartyIdentifier`, `ContactPoint`, and `ChannelIdentity`; checks `Party.isBlocked` (returns `403` if blocked).
  2. Snapshots `OrderLine` rows (`unitAmountMinor`, `currency` via `CurrencyMetadata`, `offeringNameSnapshot`, `durationMinSnapshot`).
  3. Reserves capacity via `CapacityPort.reserveCapacity` (`InventoryMovement(RESERVE)` for goods + GiST-guarded `SlotReservation` for services).
  4. Creates `PaymentPlan` and `PaymentMilestone` rows (`FULL` = 1 milestone; `DEPOSIT_30_70` = `30% DEPOSIT` + `70% BALANCE`).
  5. Creates `FulfillmentPlan` and independent `FulfillmentSegment` rows (`INVENTORY` / `DELIVERY` for goods; `APPOINTMENT` for services; `DIGITAL` for digital offerings).
  6. Enqueues Staff Bot pager notification (`STAFF_BOT_OUTBOUND`) via durable `InboxEvent`.

### 3.2. Segment Completion Evidence (`POST /api/admin/fulfillment/segments/[id]/evidence`)
- **Role**: `PERFORMER` (must match `segment.assignedStaffId === actor.actorId` or `actor.actorRole !== 'PERFORMER'`), `OPERATOR`, or `OWNER`.
- **Input (Zod)**:
  ```typescript
  const CompletionEvidenceSchema = z.object({
    notes: z.string().max(1000).optional(),
    serialNumber: z.string().max(128).optional(),
    mediaUrls: z.array(z.string().url()).max(10).default([]),
    checklist: z.record(z.string(), z.boolean()).default({}),
    markSegmentCompleted: z.boolean().default(true),
  });
  ```
- **Behavior**: Appends `CompletionEvidence`, transitions `FulfillmentSegment` to `COMPLETED` (if `markSegmentCompleted`), commits `InventoryMovement(COMMIT)` for inventory segments, and if all segments in `FulfillmentPlan` are `COMPLETED`, transitions `FulfillmentPlan` to `COMPLETED` and `Order` to `FULFILLED`.

---

## 4. Redacted Read Model Contracts (`[MVP-CORE]` — `FR-326`, `INV-008`, `INV-010`)

All read models strip raw PII (`customerPhone`, `customerEmail`, `customerNotes`) so they are safe for operational dashboards, telemetry, and the optional `Agent Read Pack`:

```typescript
export type OrderSummaryView = {
  orderId: string;
  status: string;
  partyId: string;
  partyMaskedRef: string; // e.g., "P-8f2a (Verified TG)" — never raw phone/email
  currency: string;
  grossAmountMinor: string;
  paidAmountMinor: string;
  paymentPlanStatus: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  fulfillmentPlanStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'CANCELLED' | 'REQUIRES_ATTENTION';
  lineCount: number;
  hasOpenOperatorAction: boolean;
  createdAt: string;
};

export type OperatorActionView = {
  id: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
  affectedAggregateType: string;
  affectedAggregateId: string;
  recommendedNextAction: string;
  availableSafeActions: string[];
  dueAt: string | null;
  createdAt: string;
};

export type CashCommitmentView = {
  currency: string;
  paidMinor: string;
  dueThisWeekMinor: string;
  overdueMinor: string;
  promisedRefundsMinor: string;
  disputedMinor: string;
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
