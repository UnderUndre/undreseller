# Booking-First Template Acceptance Runbook (`003.1`)

**Feature Branch**: `specs/003-commerce-operations-capability-packs`  
**Date**: 2026-10-22
**Target**: Single-business service template with public business and professional pages, portfolios, service listings, and appointment booking.

---

## 1. Configure a Client Installation

1. Set the business name, public description, logo, public contact links, locale, timezone, and currency in deployment settings. New setup starts at `USD`; the owner must confirm or change it to the business's actual currency before publishing live prices. Currency must not be inferred from locale.
2. Create staff accounts through the owner-only Better Auth provisioning flow, using only the three supported roles: `OWNER`, `OPERATOR`, and `PERFORMER`.
3. Add each professional's profile, portfolio items, services, resource, and working hours. For every service, enable `IN_CALL` (customer visits the configured service address), `OUT_CALL` (professional visits the customer's address), or both. Set a service price for each enabled mode, an optional separate outcall service price, a fixed per-booking travel fee, and outcall travel buffers. An owner who also takes appointments can be linked to a bookable resource.
4. Set the service address used for `IN_CALL` and choose whether to publish it. Add the customer-facing `OUT_CALL` coverage description. The first release does not check routes or distance, so an outcall booking remains pending until an owner or operator confirms the address is in the coverage area.
5. Publish the business page, professional pages, service listings, and portfolio items.
6. Configure no more than one external API integration for the client, if one is needed. The core booking journey must remain usable without it.

## 2. Verify the Public Booking Journey

1. Open the public business page and confirm it shows only published business information and active services. The exact `IN_CALL` address appears only if the owner enabled public display; the outcall coverage description and enabled location modes are visible.
2. Open `/professionals/{slug}` for each published professional. Confirm the page shows the correct bio, portfolio items, and associated services.
3. Confirm an unpublished profile and unpublished portfolio item are not visible publicly.
4. Select a service and professional, compare the enabled mode prices, and confirm the outcall travel fee is shown separately in the configured currency. Submit one booking in each enabled mode with the required customer contact details. No customer account, product cart, payment provider, or messaging account should be required.
5. For `OUT_CALL`, provide a customer address and verify the request stays pending until an owner or operator confirms it is within coverage. Reject a second request and verify the booking is cancelled and its slot becomes available again.
6. Confirm the staff view shows the correct service, professional, mode, time, timezone, price breakdown, and permitted address. A private `IN_CALL` address is shared with the booking customer after booking but does not appear on public pages; an outcall address is visible only to that customer and staff authorized for the booking.
7. Attempt to create two overlapping bookings for the same professional, including a conflict with an outcall travel buffer. Only one may succeed; the other must receive a clear unavailable-slot response.
8. Cancel a booking through the customer cancellation link and through an authorized staff session. Confirm the customer link is single-use, expires at the appointment start, respects the configured cancellation cutoff, and fails when the booking ID is supplied without its token.

## 3. Verify Role Boundaries and Privacy

1. Sign in as `OWNER` through Better Auth; confirm the owner can manage staff, business settings, profiles, services, schedules, and bookings.
2. Sign in as `OPERATOR`; confirm the operator can manage assigned business operations but cannot manage staff access or protected owner settings.
3. Sign in as `PERFORMER`; confirm the performer can edit only their own profile and portfolio and can see only their own assigned bookings.
4. Revoke a staff member's Better Auth sessions and confirm the next request is rejected; deactivate the account and repeat.
5. Confirm public pages expose no customer or appointment data and application logs contain no customer addresses, raw customer contact details, Better Auth credentials/session values, or cancellation tokens.
6. In an isolated verification environment, compare two client installations and confirm their databases, secrets, settings, and backup sets are separate and inaccessible to each other.

## 4. Production Readiness

- Run the guarded migrations and rollback procedure; verify existing services, customer records, and appointment history remain intact. Historical bookings must remain without inferred location modes, addresses, or price breakdowns.
- Run the profile in `spec.md`'s standard load section and record p95/p99 for public pages, availability, and booking create/cancel, plus concurrency and peak app RSS.
- Restore a backup no older than 24 hours and record its age and restore duration; handoff requires RPO `<= 24 hours` and RTO `<= 60 minutes`.
- Confirm the live domain, TLS, business contact links, timezone, configured currency, location modes, prices and travel fee, and one end-to-end booking cycle during onboarding.
- Verify a selected external API integration only when it is included in the signed project scope. Payment-provider and product-sale checks belong to a later release.

---

## Later Capability Packs

Product sales, inventory, mixed carts, online payments, advanced operator workflows, messaging bots, compliance integrations, and the optional AI Lab are not prerequisites for `003.1`. Their acceptance runbooks are defined when those packs are scheduled.
