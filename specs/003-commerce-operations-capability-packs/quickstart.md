# Booking-First Template Acceptance Runbook (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Target**: Single-business service template with public business and professional pages, portfolios, service listings, and appointment booking.

---

## 1. Configure a Client Installation

1. Set the business name, public description, logo, public contact links, locale, IANA timezone, and currency in deployment settings (`PUT /api/admin/settings`). New setup starts at `USD` with `currencyConfirmed = false`; the owner must confirm or change it to the business's actual currency before live service prices are published. Currency must not be inferred from locale.
2. Bootstrap the initial `OWNER` account via `npx tsx scripts/bootstrap-owner.ts` (or a one-time audited `Authorization: Bearer <ADMIN_TOKEN>` call to `POST /api/admin/staff`), then create additional staff accounts through the owner-only Better Auth provisioning flow (`POST /api/admin/staff`), using only the three supported roles: `OWNER`, `OPERATOR`, and `PERFORMER`.
3. Add each professional's profile, portfolio items, services, resource, and working hours (`WeeklyHours` + `AvailabilityException` in the business's IANA timezone). For every service, enable `IN_CALL` (customer visits the configured service address), `OUT_CALL` (professional visits the customer's address), or both. Set a service price for each enabled mode, an optional separate outcall service price, a fixed per-booking travel fee, and service/outcall travel buffers. An owner who also takes appointments can be linked to a bookable resource.
4. Set the service address used for `IN_CALL` (`businessServiceAddress`) and choose whether to publish it (`businessServiceAddressPublic`). Add the customer-facing `OUT_CALL` coverage description. The first release does not check routes or distance, so an outcall booking remains `PENDING` (`SlotReservation.status = HELD` with `holdExpiresAt = null`) until an owner or operator confirms the address is in the coverage area.
5. Publish the business page, professional pages, service listings, and portfolio items.
6. Configure no more than one external API integration for the client, if one is needed. The core booking journey must remain usable without it.

## 2. Verify the Public Booking Journey

1. Open the public business page and confirm it shows only published business information and active services. The exact `IN_CALL` address appears only if the owner enabled public display; the outcall coverage description and enabled location modes are visible.
2. Open `/professionals/{slug}` for each published professional. Confirm the page shows the correct bio, portfolio items, and associated services.
3. Confirm an unpublished profile, deactivated staff profile, and unpublished portfolio item are not visible publicly (`404`).
4. Select a service and professional, compare the enabled mode prices, and confirm the outcall travel fee is shown separately in the configured currency. Submit one booking in each enabled mode with the required customer contact details. No customer account, product cart, payment provider, or messaging account should be required.
5. For `OUT_CALL`, provide a customer address and verify the request stays `PENDING` (`HELD` without 15-minute payment auto-expiry) until an owner or operator confirms it is within coverage (`PATCH /api/admin/bookings/[id]`). Reject a second request and verify the booking is cancelled (`STAFF_REJECTED`) and its buffered slot becomes available again.
6. Confirm the staff view shows the correct service, professional, mode, appointment time, buffered occupied window, timezone, price breakdown, and permitted address. A private `IN_CALL` address is shared with the booking customer after booking but does not appear on public pages; an outcall address is visible only to that customer and staff authorized for the booking.
7. Attempt to create two overlapping bookings for the same professional, including a conflict with a service buffer or outcall travel buffer. Only one may succeed; the other must receive HTTP `409 SLOT_UNAVAILABLE`.
8. Open the customer cancellation URL via `GET` and confirm that merely loading the page (or a link-preview crawler prefetching it) does not cancel the booking. Then submit cancellation via `POST /api/booking/[id]/cancel` (and separately via an authorized staff session). Confirm the customer token is single-use, expires at `appointmentStartTime`, respects `cancellationCutoffHours`, and fails when the booking ID is supplied without its token.

## 3. Verify Role Boundaries and Privacy

1. Sign in as `OWNER` through Better Auth (`/api/auth/sign-in/email`); confirm the owner can manage staff, business settings, profiles, services, schedules, and bookings.
2. Sign in as `OPERATOR`; confirm the operator can manage services, profiles, schedules, bookings, and `OUT_CALL` coverage approvals/rejections, but cannot manage staff access or owner-only business settings (`403`).
3. Sign in as `PERFORMER`; confirm the performer can edit only their own profile and portfolio, can see only their own assigned bookings, and cannot approve/reject `OUT_CALL` coverage or edit another staff member's profile (`403`).
4. Revoke a staff member's Better Auth sessions (`POST /api/admin/staff/[id]/revoke-sessions`) and confirm the next request is rejected (`401`); deactivate the account (`deactivateAccount = true`) and verify their public profile is hidden (`404`) while existing future bookings remain visible to `OWNER`/`OPERATOR` for reassignment.
5. Confirm public pages expose no customer or appointment data and application logs contain no customer addresses, raw customer contact details, Better Auth credentials/session values, temporary passwords, or cancellation tokens.
6. In an isolated verification environment, compare two client installations and confirm their databases, secrets, settings, and backup sets are separate and inaccessible to each other.

## 4. Production Readiness

- Run the guarded migrations and rollback procedure (`T011`, `T012`); verify existing services, customer records, and appointment history remain intact. Historical bookings must remain without inferred location modes, addresses, or price breakdowns.
- Run the profile in `spec.md`'s standard load section (`T058`) and record p95/p99 for public pages, availability, and booking create/cancel, plus concurrency and peak app RSS (`<= 500 MB`).
- Restore a backup no older than 24 hours (`scripts/verify-single-vps-dr.sh`, `T059`) and record its age and restore duration; handoff requires RPO `<= 24 hours` and RTO `<= 60 minutes`.
- Confirm the live domain, TLS, business contact links, timezone, configured currency, location modes, prices and travel fee, and one end-to-end booking cycle during onboarding.
- Verify a selected external API integration only when it is included in the signed project scope. Payment-provider and product-sale checks belong to a later release.

---

## Later Capability Packs

Product sales, inventory, mixed carts, online payments, advanced operator workflows, messaging bots, compliance integrations, and the optional AI Lab are not prerequisites for `003.1`. Their acceptance runbooks are defined when those packs are scheduled.
