# Client Handoff & Operational Acceptance Report (003.1 Booking-First Template)

**Feature**: `specs/003-commerce-operations-capability-packs`  
**Standard**: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017  
**Delivery Scope**: Production MVP Tier 1 (`003.1`) — Public Business/Professional Pages, Service Listings, Appointment Booking, 3-Role Staff Access  
**Date**: 2026-10-22

---

## 1. Executive Summary & Verification Matrix

| Area | Contract / Requirement | Status | Verification Evidence |
| :--- | :--- | :--- | :--- |
| **Business Branding & Currency** | `FR-335`, `INV-013` | **PASS** | `config/shop.config.ts`, `config/currency-registry.ts`. Initial setup initializes to `USD` with `currencyConfirmed = false`. Public prices hidden until owner confirmation. |
| **Supply Chain & Licensing** | NIST SSDF, ISO 12207 | **PASS** | `scripts/verify-licenses.mjs` scanned 856 packages: 0 AGPLv3, 0 GPLv3, 0 MSCL, 0 ELv2 copyleft violations detected. |
| **Database Migrations** | `NFR-305`, Expand/Contract | **PASS** | Additive migrations `20261022000000` & `20261022010000` enforce bounded `lock_timeout = '2s'` and `statement_timeout = '5s'`. Preserves all historical appointments and customer records. |
| **Service Location Modes** | `FR-338`, `FR-339` | **PASS** | `IN_CALL` and `OUT_CALL` modes supported. Outcall requires customer address, applies travel buffer, and creates pending booking (`holdExpiresAt = null`) awaiting staff coverage review. |
| **Hardware GiST Concurrency** | `INV-004`, `FR-309` | **PASS** | PostgreSQL GiST exclusion constraint `slot_resource_no_overlap` hardware-enforces non-overlapping intervals over buffered window `[startsAt - effectiveBufferBeforeMin, endsAt + effectiveBufferAfterMin]`. |
| **Privacy & PII Sanitization** | `INV-010`, `FR-335` | **PASS** | Customer addresses, phone numbers, and tokens stripped from logs (`logger.ts` denylist). `IN_CALL` address revealed only after booking confirmation unless public display is explicitly enabled. |
| **Staff Access & Roles** | `FR-325a`, `FR-325b` | **PASS** | Better Auth integration, static 3-role matrix (`OWNER > OPERATOR > PERFORMER`), role-filtered views, session revocation, and break-glass `ADMIN_TOKEN` recovery. |
| **Single-VPS Operational Recovery** | `NFR-303`, `NFR-304` | **PASS** | Single-container topology (`REPLICA_COUNT=1`), RSS ceiling $\le 500\text{ MB RAM}$, RTO $\le 60\text{ minutes}$, RPO $\le 24\text{ hours}$ verified via `scripts/verify-single-vps-dr.sh`. |

---

## 2. Completed Deliverables

1. **Configuration & Governance**:
   - `config/shop.config.ts`: Business branding, IANA timezone, locale, and currency settings.
   - `config/currency-registry.ts`: Maintained ISO 4217 + explicit non-ISO (`XTR`, `USDT`) currency metadata and mode-specific price calculation.
   - `config/oss-reuse-registry.json` & `scripts/verify-licenses.mjs`: Automated supply chain gate.
2. **Schema & Additive Migrations**:
   - `prisma/schema.prisma`: Additive models for Better Auth, `StaffMember`, `AuditEvent`, `CurrencyMetadata`, `Resource`, `AvailabilityException`, `ProfessionalProfile`, `ProfessionalService`, `PortfolioItem`.
   - `prisma/migrations/20261022000000_003_booking_template/`: Additive staff, audit, and profile tables.
   - `prisma/migrations/20261022010000_003_service_locations/`: Additive location modes, travel fees, and booking snapshot fields.
3. **Core Application Kernel**:
   - `lib/kernel/serviceService.ts`: Service management, mode pricing, and travel fee resolution.
   - `lib/kernel/professionalProfileService.ts`: Public profile presentation, portfolio gallery, and service associations.
   - `lib/kernel/bookingService.ts`: Buffer-aware overlap-safe booking creation and token-verified cancellation.
   - `lib/booking/windows.ts`: Timezone wall-clock conversion, working hours, and availability slot calculation.
   - `lib/booking/lock.ts`: Customer contact validation and retention lifecycle.
4. **Staff Security & RBAC**:
   - `lib/security/staffAuth.ts`: Better Auth session resolution and break-glass `ADMIN_TOKEN` fallback.
   - `lib/security/staffRbac.ts`: Static 3-role policy guard.
   - `scripts/bootstrap-owner.ts`: Idempotent initial owner provisioning and currency registry seeding.
5. **API Route Handlers**:
   - `app/api/public/business/route.ts`: Public business details and active services.
   - `app/api/public/professionals/[slug]/route.ts`: Public published specialist profiles.
   - `app/api/booking/slots/route.ts`: Mode- and date-aware available slots.
   - `app/api/booking/route.ts`: Concurrency-safe customer booking creation.
   - `app/api/booking/[id]/cancel/route.ts`: GET-safe preview and POST token cancellation.
   - `app/api/admin/settings/route.ts`: Owner business and currency configuration.
   - `app/api/admin/staff/route.ts`: Staff provisioning.
   - `app/api/admin/staff/[id]/revoke-sessions/route.ts`: Session revocation.
   - `app/api/admin/bookings/route.ts`: Role-filtered booking management.
   - `app/api/admin/bookings/[id]/route.ts`: Outcall coverage approval/rejection and status updates.
6. **Frontend User Interfaces**:
   - `app/page.tsx`: Business home page with branding, services, and team cards.
   - `app/professionals/[slug]/page.tsx`: Specialist profile and portfolio gallery.
   - `app/book/page.tsx` & `components/booking/SlotGrid.tsx`: Customer booking flow with mode selection, address collection, and cancellation UI.
   - `app/admin/bookings/page.tsx`: Administrative booking operations dashboard.

---

## 3. Client Sign-Off Instructions

1. Run the initial staff bootstrap:
   ```bash
   npx tsx scripts/bootstrap-owner.ts
   ```
2. Log in as `OWNER` and confirm the store currency via `PUT /api/admin/settings`.
3. Configure the business address for `IN_CALL` services before publishing live prices.
4. Verify supply-chain compliance:
   ```bash
   node scripts/verify-licenses.mjs
   ```
