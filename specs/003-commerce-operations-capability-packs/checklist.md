# Specification Review Checklist: Booking-First Service Template

**Updated**: 2026-10-22
**Feature**: `specs/003-commerce-operations-capability-packs/spec.md`  
**Review state**: Scope revised; cross-artifact analysis and external reviews must be rerun before implementation.

---

## Scope and User Value

- [x] Initial audience is independent professionals and small service businesses; medium businesses are a later expansion segment.
- [x] First release centers on a public business page, professional pages with portfolio and services, and appointment booking.
- [x] Exactly three staff roles remain: `OWNER`, `OPERATOR`, and `PERFORMER`.
- [x] Product sales, inventory, mixed carts, online payment processing, and advanced messaging are deferred to later capability packs.
- [x] Each installation serves one client business; a professional's public page lives under the business site in the first release.
- [x] The booking flow works without a payment provider or messaging integration; each client may select at most one external API integration for the release.

## Requirements Still to Verify

- [x] Business branding, locale, timezone, and currency are configured per installation; no country or currency is hardcoded in the core template.
- [x] Public professional pages expose only published profile, portfolio, and service data.
- [x] A performer can edit only their own profile and view only their assigned appointments; an owner may also be a bookable professional.
- [x] Appointment availability accounts for service duration, resource schedules, exceptions, timezone, and existing bookings.
- [x] Services can enable customer visits (`IN_CALL`), professional visits (`OUT_CALL`), or both; outcall travel buffers affect availability.
- [x] Each enabled mode has a configured price; outcall can use a separate service price and fixed travel fee, both shown before booking in the configured currency.
- [x] Outcall addresses are collected only for `OUT_CALL`; without route/geocoding checks, outcall requests stay pending until an owner/operator confirms coverage, and rejection releases the slot.
- [x] New bookings preserve the selected mode, address, service price, travel fee, and currency; historical bookings remain unknown when those values cannot be derived safely.
- [x] Public address visibility follows the owner's setting; customer service addresses stay out of public responses, logs, analytics, and unauthorized staff views.
- [x] Schema changes are additive and preserve existing services, customers, and appointments.
- [ ] Confirm exact profile, service, schedule, and booking table names against the current Prisma schema during implementation planning.
- [x] Specify the booking-bound cancellation credential, customer-contact handling, and profile-publication rules in the user stories, data model, and API contracts.
- [x] Define a reproducible booking-only load profile and measurable single-VPS recovery acceptance in the spec, plan, tasks, and quickstart.
- [ ] Measure the specified latency, concurrency, memory, RTO, and RPO targets during implementation acceptance.

## Clarification Decisions

| Decision | State | Notes |
| :--- | :--- | :--- |
| Initial product scope | **Updated** | `003.1` is public professional pages and service booking. Earlier broad commerce MVP language is superseded. |
| Staff roles | **Retained** | Fixed `OWNER`, `OPERATOR`, `PERFORMER` model; no custom role builder. |
| Staff authentication | **Retained; Better Auth selected** | Individual staff identity mapping, library-managed database sessions, application-owned three-role checks, and audited break-glass access. |
| Deployment boundary | **Retained** | One business per installation and database. |
| Operational baseline | **Retained; revalidate** | Single-VPS availability, backup/restore, concurrency, and memory criteria remain in scope. |
| Service location and price | **Added** | A service may be `IN_CALL`, `OUT_CALL`, or both. Outcall may have its own service price and a separately displayed fixed travel fee; it is not required to cost more. |

## Review Gates

- [x] Regenerate `reviews/analyze.md` for the revised specification, plan, data model, API contracts, quickstart, and tasks, including the new location-mode and outcall pricing rules.
- [ ] Obtain the required two external reviews for this revised scope. Existing `reviews/codex.md` and `reviews/copilot.md` refer to the earlier broad scope and are historical evidence only.
- [ ] Update this checklist from pending to pass only after the new analysis and external reviews agree that the MVP boundary is consistent.

## Verdict

**Status: PENDING REVIEW.** The business direction and release boundary are updated, but implementation remains gated on fresh analysis and cross-AI reviews.
