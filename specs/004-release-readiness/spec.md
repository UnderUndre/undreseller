# Feature Specification: Release Readiness — Payments, Booking Integrity, i18n & Money Features

> "Какое ТЗ — такое и ХЗ." — Folk Wisdom
> "Обувать пизду в лапти." — Народная мудрость о художественном пиздеже вместо ТЗ
> "Why don't you explain this to me like I'm five." — Майкл Скотт (_The Office_)
> "Well, I didn't realize you had documentation." — Бабуленька (_Young Sheldon_)

**Feature Branch**: `004-release-readiness`
**Created**: 2026-10-24
**Status**: Draft
**Input**: User description: "подготовить приложение к релизу — i18n (ru/en/uk), чистый TG-бот гибрид с Mini App, унификация оплаты по FR-316, waitlist и any-available-staff, кастомные поля брони" + decisions from research Q&A (market outside RF; i18n scope = all surfaces; crypto external-link compromise accepted).
**Research inputs**: `research.md`, `competitors-research.md`, `ai-features-research.md`, `mcp-server-research.md`, `003-tasks-audit.md`, `backlog-carried-over-0032.md` (this directory).
**Business plan constraint**: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v18.4 — Sprint B lineage (booking-first template, 3 roles, ≤1 external integration, white-label one-instance-per-business, ≤500 MB RSS per instance); online payments belong to post-Sprint-B releases (this one).

## Clarifications

### Session 2026-10-24

- Q: Release policy for mixed carts (service + physical product in one order)? → A: **Blocked at checkout with guidance to place two separate orders**, until the 003.2 fulfillment pack ships (FR-426).
- Q: Default deposit policy when online payment is enabled? → A: **No deposit by default** (pay at venue; booking confirms via hold/staff semantics) — first-booking conversion outweighs no-show protection at launch, and crypto refunds carry gas costs, no reverse gateway, and volatility exposure. Prepayment becomes a **per-service owner setting** ("require full prepayment"); fixed/percentage deposits are deferred to the payment-plans pack (003.2 backlog) since partial-deposit logic does not exist in the codebase.

## User Scenarios & Testing _(mandatory)_

### User Story 1 — Trustworthy Payments & Booking Integrity (Priority: P1)

A customer books a slot and pays online (optional per instance). Money and calendar never contradict each other: a slot is never sold twice, a slow crypto confirmation never silently expires a paid booking, and an underpaid order is routed to explicit human resolution instead of hanging. The platform owner selects a payment provider in deployment configuration; swapping or removing a provider requires no changes to the booking flow (003 FR-316 lineage). Booking without any online payment provider keeps working end to end.

**Why this priority**: Every audit (003-tasks-audit, research forensic passes) ranks double-booking and payment reconciliation as the only monetary P0 class; a release with a broken money path cannot be sold under the Sprint B contract.

**Independent Test**: Simulate a full crypto payment lifecycle with a stubbed gateway (waiting → confirming → finished; partially_paid; expired) against one slot and verify state transitions, notifications, and slot availability at each step.

**Acceptance Scenarios**:

1. **Given** 100 concurrent booking attempts on the same slot, **When** all submit, **Then** exactly one reservation reaches CONFIRMED (or HELD-with-valid-hold) and the other 99 receive a clear "slot taken" outcome with zero double-bookings.
2. **Given** a HELD slot whose payment gateway reports `confirming` (transaction seen, awaiting network confirmations), **When** the original hold TTL expires, **Then** the hold is frozen/extended until a terminal gateway status instead of releasing the slot.
3. **Given** a gateway callback reporting `partially_paid`, **When** processed, **Then** the order moves to UNDERPAID, staff is notified, the customer is told how to top up or cancel, and the slot is NOT auto-confirmed.
4. **Given** an instance with no payment provider configured, **When** a customer books, **Then** the booking completes on hold/staff-confirmation semantics identical to 003 behavior.
5. **Given** amounts in currencies with 0 or 3 decimal places (JPY, KWD) or crypto units, **When** stored and displayed, **Then** values use the currency registry's minor-unit scale with no hardcoded ×100 arithmetic.
6. **Given** a service flagged "require full prepayment", **When** a customer books it, **Then** the slot confirms only after a verified payment; **Given** a default (no-deposit) service, **When** booked, **Then** confirmation follows hold/staff semantics with no payment step.

---

### User Story 2 — Reliable Calendar & Notifications (Priority: P1)

Bookings happen in the business's real timezone, including DST transitions, and no booking event ever goes silently missing: every create/cancel/confirm/reject event reaches the customer via Telegram with an email fallback, and every delivery attempt is logged so staff support can answer "was the client notified?" with evidence.

**Why this priority**: Cross-platform competitor pain #1 and #2 (competitors-research) are silent notification failures and calendar desync — both are direct money losers ("master sits in an empty room") and both are table stakes the incumbents routinely break.

**Independent Test**: Configure an instance in a non-UTC timezone crossing a DST boundary; create, cancel and rebook slots around the transition with Telegram delivery forced to fail; verify email fallback fires and the delivery log shows every attempt.

**Acceptance Scenarios**:

1. **Given** an instance configured with a non-UTC IANA timezone, **When** availability is computed for a DST-transition day, **Then** offered slots match the wall-clock business hours (no one-hour shift).
2. **Given** a booking confirmation whose Telegram send fails, **When** the failure is detected, **Then** an email fallback is dispatched within 5 minutes and both attempts appear in the delivery log.
3. **Given** any booking lifecycle event, **When** staff opens the delivery history for that booking, **Then** every notification attempt shows channel, status (sent/delivered/failed), and timestamp.
4. **Given** a slot made unavailable by service buffers or an existing booking, **When** the customer views the slot grid, **Then** the reason is communicated ("booked" / "break") instead of silently hiding it.

---

### User Story 3 — Native Multilingual Experience (Priority: P1)

The full product speaks the instance's default language and the customer's language: web UI, client bot, staff bot, admin surface, and email templates render in Russian and English at launch (Ukrainian added post-launch without code changes). Language resolution: explicit user choice > Telegram `language_code` > instance default. Plurals and dates follow each locale's rules.

**Why this priority**: Market outside RF serves RU/EN-speaking diaspora plus international clients; the current English-only bot excludes the core audience (research B1 finding), and bot/admin/web language drift breaks trust in a white-label product.

**Independent Test**: Switch a test instance and a test user across ru/en (and verify fallback for an unsupported `language_code`); check plurals ("1 услуга / 2 услуги / 5 услуг"), dates with word-month format, and currency formatting.

**Acceptance Scenarios**:

1. **Given** a customer whose Telegram `language_code` is `ru` on an instance defaulting to `en`, **When** the bot and Mini App render, **Then** chrome appears in Russian.
2. **Given** `language_code` unsupported by the instance (e.g., `de`), **When** resolving language, **Then** the instance default is used with no error.
3. **Given** any count-based string (slots, services, hours), **When** rendered in ru/en, **Then** plural categories follow CLDR rules (no `count === 1 ? … : …` artifacts).
4. **Given** owner content (service names, descriptions) authored in one language, **When** the UI is switched, **Then** chrome translates while content remains in the authored language (documented surrogate-content limitation).
5. **Given** dates anywhere in UI, bots, and emails, **When** rendered, **Then** they use locale-aware word-month formats (no ambiguous `03/04`).

---

### User Story 4 — Hybrid Telegram-First Journey (Priority: P1)

The client bot becomes the front door: a persistent Telegram menu button opens the storefront Mini App; the bot itself carries quick actions (my bookings, cancel, support, language switch); catalog browsing, slot calendar, and checkout live in the Mini App; the Mini App follows the client's Telegram theme. Public professional pages (SEO surface) deep-link back into the bot.

**Why this priority**: D2 decision from research (HIGH confidence): pure-native booking bots explode into FSM/inline-keyboard pain (64-byte callback limits) while a webview-only bot loses retention; the hybrid is the documented industry pattern and preserves the existing TWA investment.

**Independent Test**: From a cold start of the bot, reach a confirmed booking in ≤ 3 taps; toggle the Telegram client theme and verify the Mini App follows; open a professional profile in a browser and jump back into the bot.

**Acceptance Scenarios**:

1. **Given** a customer opens the bot chat, **When** they look at the menu, **Then** a persistent menu button opens the storefront Mini App (no `/start` archaeology needed).
2. **Given** the customer uses "my bookings" in the bot, **When** they select a booking, **Then** they can cancel it via the existing token flow without leaving Telegram.
3. **Given** a client with a light Telegram theme, **When** the Mini App opens, **Then** colors follow the client theme (no forced dark mode).
4. **Given** a visitor on a professional's public SEO page, **When** they tap the Telegram link, **Then** they land in the bot with the professional's context.

---

### User Story 5 — Waitlist Auto-Fill & Any Available Staff (Priority: P2)

When a cancellation frees a slot, matching waitlisted customers get an instant Telegram offer — first claim wins atomically. When a customer doesn't care who serves them, "any available" proposes the best soonest slot across masters, compacting the schedule. Both features are fully deterministic (no probabilistic models).

**Why this priority**: Strongest direct-revenue signals from both research tracks (competitor complaints about lost cancellations; AI research "money features are scheduling, not LLMs"); scheduled after P1 integrity because each depends on the booking FSM being trustworthy.

**Independent Test**: Create a waitlist entry for a service/master/time window, cancel a matching booking, verify offer delivery ≤ 60s and single-winner claim under two simultaneous claims; verify "any available" proposes gap-minimizing slots.

**Acceptance Scenarios**:

1. **Given** a cancelled slot with N matching waitlist entries, **When** the cancellation event fires, **Then** offers go to the top matching entries (bounded batch) within 60 seconds.
2. **Given** two customers tap "claim" on the same offer, **When** both requests arrive, **Then** exactly one booking is created; the other receives a "already taken" response.
3. **Given** a customer chooses "any available staff", **When** slots are proposed, **Then** the ordering prefers soonest-availability while minimizing unusable gaps (< shortest service length) in masters' calendars.
4. **Given** the owner views admin, **When** checking waitlist outcomes, **Then** recovered-slot count is visible per period.

---

### User Story 6 — Custom Booking Fields (Priority: P2)

An owner adds a small set of structured fields to the booking form (text, number, single-select, checkbox — up to 10 per instance, optionally bound to specific services, with required flags). Answers travel with the booking and are visible to authorized staff only.

**Why this priority**: Top validated differentiator from competitor research (Square's most-cited gap): verticals (barber, massage, cleaning, at-home services) each need 1–3 niche questions; minimal set keeps solo-dev scope bounded.

**Independent Test**: Define fields ("Beard trim? yes/no", "Floor number"), book with and without them, verify validation, persistence, and staff-only visibility.

**Acceptance Scenarios**:

1. **Given** an owner-defined required field bound to a service, **When** a customer books that service, **Then** the form renders the field and blocks submission until valid.
2. **Given** a booking with custom answers, **When** authorized staff opens it, **Then** answers are displayed with the booking; unauthorized roles see none of them.
3. **Given** an unbound (instance-wide) optional field, **When** left empty, **Then** booking proceeds.

---

### User Story 7 — Privacy & Abuse-Resistance Hardening (Priority: P2)

Close the audit's P1 debt class before exposing the product publicly: audit-log PII redaction, scheduled purge of service address snapshots, API rate limiting on booking/cancel/claim endpoints, OUT_CALL address enforcement at the API boundary, a defined mixed-cart policy, and honest release evidence (real end-to-end booking acceptance and a disaster-recovery drill that performs an actual restore).

**Why this priority**: GDPR-market launch (outside RF) makes PII hygiene a legal baseline; the 003 audit found these claims marked done but not implemented (fake DR evidence, unredacted audit reasons) — shipping them as-is would repeat the pattern.

**Independent Test**: Fire malformed/abusive request bursts at booking endpoints; inspect audit rows and purge job output for redaction and snapshot removal; execute the DR drill against a real restored backup.

**Acceptance Scenarios**:

1. **Given** any staff/audit mutation, **When** the audit record is written, **Then** free-text reason fields are PII-redacted before persistence.
2. **Given** bookings older than the retention window, **When** the nightly purge runs, **Then** service address snapshots are removed consistently with other customer fields.
3. **Given** repeated booking/cancel/claim requests beyond limits from one contact, **When** limits are exceeded, **Then** further requests are throttled with clear errors and no slot state corruption.
4. **Given** an OUT_CALL booking request without an address, **When** it hits the API, **Then** it is rejected with a field-level validation error at the boundary.
5. **Given** a checkout attempt mixing services and physical products in one order, **When** submitted, **Then** the defined release policy (blocked with split guidance — see Assumptions) is applied consistently in UI and API.
6. **Given** the release DR drill, **When** executed, **Then** it performs an actual restore from a real backup and records measured RTO/RPO, not simulated numbers.

### Edge Cases

- DST-transition days: slot grid must match wall-clock hours (US2-SC1); a slot that "moves" across the transition must not double-book.
- Hold TTL vs late `confirming`: payment seen at TTL-ε — freeze wins (US1-SC2); payment seen after slot released and re-booked → existing overbook-resolution path (manual resolution + refund request).
- Duplicate/replayed gateway webhooks: idempotent processing, no double confirmation (regression of existing inbox dedup).
- Prepaid booking cancelled within the refund window: crypto refund is not automatic-push — staff task with amount rule (fiat-equivalent at payment time) and gas-cost awareness (FR-430).
- Waitlist offer for an already-reclaimed slot: late claimants get "taken", no partial states.
- `language_code` unsupported or missing → instance default, never an error screen.
- Zero-decimal and triple-decimal currencies: display and storage without cents assumption.
- Waitlist broadcast storms: bounded batch size per cancellation; per-user offer frequency caps.
- Custom-field answers containing injection payloads or oversized text: sanitized, length-capped, never rendered raw in staff UI.
- Mixed-cart attempt from a stale client cache after policy deploy: server-side enforcement is authoritative.

## Requirements _(mandatory)_

### Functional Requirements

**Payments & booking FSM**

- **FR-401**: Payment integrations MUST use a provider-neutral contract with providers selected from deployment configuration; the booking flow MUST operate end to end with zero providers configured (003 FR-316 lineage).
- **FR-402**: Online payment MUST create invoices through the provider's server-side API and return the provider's payment URL; construction of payment links from templates/order IDs is prohibited.
- **FR-403**: A booking MUST progress through an explicit state machine: AVAILABLE → HELD (bounded TTL) → PAYMENT_PENDING → CONFIRMED, with transitions to AVAILABLE on timeout/failure, and to UNDERPAID on partial payment requiring human resolution with customer and staff notification.
- **FR-404**: The first gateway status indicating an in-progress transaction (`confirming` or equivalent) MUST freeze/extend the slot hold until a terminal status arrives.
- **FR-405**: Monetary amounts MUST be stored and computed in the currency's registry-defined minor units (scale 0/2/3 and provider wire scales translated at the provider boundary); hardcoded decimal arithmetic is prohibited (003 FR-303 lineage).
- **FR-406**: Payment callbacks MUST be signature-verified and processed idempotently keyed on the provider payment identifier (regression: existing HMAC + inbox dedup behavior).
- **FR-407**: Booking protection policy MUST default to "no deposit" (pay at venue; booking confirms via hold/staff-confirmation semantics); owners MUST be able to require full online prepayment per service; fixed/percentage deposit policies are deferred to the payment-plans pack (Out of Scope).
- **FR-430**: Cancellation of a prepaid booking within the owner's refund window MUST trigger a recorded refund workflow (provider refund or an explicit staff task for manual crypto reimbursement), with the applicable refund-amount rule visible to staff.

**Calendar & notifications**

- **FR-408**: Availability MUST be computed in the business's configured IANA timezone, correctly handling DST transitions; the slot grid MUST communicate unavailability reasons (booked vs break/buffer).
- **FR-409**: Every booking lifecycle event (created, confirmed, cancelled, rejected, rescheduled) MUST notify the customer via Telegram; on delivery failure an email fallback MUST fire; all attempts MUST be recorded in a delivery log visible to authorized staff.
- **FR-410**: Dates across all surfaces MUST render in locale-aware word-month formats.

**Internationalization**

- **FR-411**: All user-facing strings across web, client bot, staff bot, admin, and email templates MUST be externalized with ru and en complete at launch and uk addable post-launch without code changes.
- **FR-412**: Language resolution MUST follow: explicit user choice > Telegram `language_code` > instance default; unsupported codes fall back to the instance default.
- **FR-413**: Pluralized strings MUST follow CLDR plural categories for the active locale.
- **FR-414**: Owner-authored content MUST remain in its authored language regardless of UI locale (UI chrome translation only).

**Hybrid Telegram experience**

- **FR-415**: A persistent bot menu button MUST open the storefront Mini App.
- **FR-416**: The client bot MUST provide: my bookings, cancel (existing token flow), support contact, and language switching; a booking journey MUST be reachable within 3 taps from the bot menu.
- **FR-417**: The Mini App MUST follow Telegram client theme parameters; forced color schemes are prohibited.
- **FR-418**: Public professional pages MUST expose a deep link returning the visitor into the Telegram bot with professional context.
- **FR-431**: All brand and semantic color usage across all surfaces MUST derive from the shared `@underundre/undesign` token system (single source of truth: brand scales, semantic tokens, light/dark surfaces); generic palette utilities MUST NOT be used for brand or semantic roles.

**Waitlist & any-available**

- **FR-419**: A customer MUST be able to join a waitlist specifying service, optional master preference, and a time window, from the slot grid and from cancellation flows.
- **FR-420**: A cancellation MUST trigger waitlist offers to the best-matching bounded batch of entries via Telegram inline actions; claims MUST be atomic single-winner; losers receive a definitive "taken" outcome.
- **FR-421**: An "any available staff" option MUST propose the soonest valid slots across masters, deterministically minimizing calendar fragmentation; probabilistic/model-based scheduling is prohibited in this release.
- **FR-422**: The admin surface MUST show waitlist outcome counts (offers sent, slots recovered) per period.

**Custom booking fields**

- **FR-423**: Owners/operators MUST be able to define up to 10 booking fields per instance of types text, number, single-select, checkbox — optionally bound to specific services, with required flags and validation.
- **FR-424**: Custom field answers MUST be stored with the booking and visible only to authorized staff roles.

**Hardening**

- **FR-425**: Booking API MUST reject OUT_CALL requests lacking a service address with a field-level validation error at the boundary.
- **FR-426**: Mixed service+product carts MUST be blocked at checkout with clear guidance to place two separate orders, until the 003.2 fulfillment pack ships (confirmed in Clarifications).
- **FR-427**: Booking create/cancel, waitlist claim, and bot command endpoints MUST enforce per-contact rate limits and bounded payload sizes.
- **FR-428**: Audit free-text fields MUST be PII-redacted before persistence, and service address snapshots MUST be included in scheduled retention purges consistent with other customer data.
- **FR-429**: Destructive staff actions in the staff bot MUST require an explicit confirmation step, and customer notification on rejection MUST follow an owner-configurable policy (auto-message / alternative slot offer / manual follow-up).

### Non-Functional Requirements (NFR) _(ISO/IEC/IEEE 29148:2018)_

- **NFR-401 (Latency)**: Availability queries p95 < 300 ms and p99 < 800 ms; booking creation p95 < 500 ms under the standard load profile.
- **NFR-402 (Capacity)**: Application memory MUST remain ≤ 500 MB RSS per instance (business-plan operating ceiling); no release feature may introduce a resident inference/ML runtime.
- **NFR-403 (Timeliness)**: Waitlist offers dispatched with p95 ≤ 60 s from cancellation; Telegram→email fallback within 5 minutes of a failed primary delivery.
- **NFR-404 (Retention)**: Notification delivery logs retained ≥ 90 days; address snapshots purged per the retention schedule (≤ 30 days post-completion).
- **NFR-405 (Availability & Recovery)**: Monthly availability target 99.5%; RTO ≤ 60 min; RPO ≤ 24 h — evidenced by a DR drill performing a real restore.
- **NFR-406 (i18n integrity)**: 100% of user-facing chrome strings externalized, enforced by automated coverage checks; zero hardcoded user-facing literals in new code.
- **NFR-407 (Idempotency)**: Duplicate payment callback delivery (100 replays) produces zero duplicate side effects.

### Regulatory & Compliance Screening _(ISO/IEC/IEEE 12207 Phase 0)_

- **Jurisdictions**: GDPR (EU/UK — primary market decision: outside RF); no 152-ФЗ scope.
- **Data Classification**: PII (customer contacts, service addresses, booking custom-field answers), payment references (provider IDs); no cardholder data — crypto gateway redirects keep the platform out of PCI CDE (SAQ-A-like scope).
- **Compliance Scope Reduction**: AI/LLM features excluded from this release entirely; no customer data is sent to any model provider as part of release functionality.
- **Kill Criteria (Falsifiability)**: If the FSM/payment work adds > 150 ms p95 to booking creation, exceeds the 500 MB ceiling, or provider abstraction leaks provider specifics into booking flows — the feature is re-architected before release.

### Security & Threat Mitigation (STRIDE)

- **Spoofing**: Payment callbacks authenticated by HMAC signature verification; waitlist claims bound to the originating chat/session; session cookie integrity unchanged from 003.
- **Tampering**: Amounts integrity via registry minor units; idempotency keys on mutations; FSM transitions guarded server-side (client state is never authoritative).
- **Repudiation**: Delivery log + redacted audit events provide non-repudiable evidence of who did what and which notification went where.
- **Information Disclosure**: PII redaction in audit; address snapshot purge; waitlist offers must not disclose other customers' identities; custom-field answers staff-only.
- **Denial of Service**: Rate limits on booking/cancel/claim/bot commands; bounded hold TTLs prevent slot-squatting via fake invoices; bounded waitlist broadcast batches.
- **Elevation of Privilege**: Custom-field definitions and rejection policies restricted to OWNER/OPERATOR; PERFORMER boundaries unchanged from 003 RBAC.

### Key Entities

- **PaymentProviderContract**: provider-neutral capability/selection contract (per 003 spec §Payment Provider Contract); adapters translate wire formats at the boundary.
- **BookingHold (FSM)**: reservation states AVAILABLE / HELD / PAYMENT_PENDING / CONFIRMED / UNDERPAID / FAILED / EXPIRED with bounded TTLs and freeze semantics.
- **WaitlistEntry / WaitlistOffer**: customer subscription (service, master preference, window) and per-cancellation offer batches with single-winner claims.
- **CustomBookingField / BookingFieldAnswer**: typed field definitions (owner-managed) and per-booking answers (staff-visible).
- **NotificationDeliveryLog**: channel, target, status (sent/delivered/failed), timestamps per booking event.
- **InstanceLanguageSettings**: instance default locale, enabled locales, per-user language override.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-401**: 100 concurrent same-slot booking attempts yield exactly one confirmed booking and zero double-bookings (automated test).
- **SC-402**: A new customer completes find-service → pick-slot → book → pay (where enabled) → receive confirmation in ≤ 3 minutes and ≤ 6 taps.
- **SC-403**: Automated scans find zero PII occurrences in audit reasons and delivery logs across the acceptance suite.
- **SC-404**: A new white-label instance configured with a non-UTC timezone and either launch language is deployable and correct (slots, dates, plurals, currency) within one working day.
- **SC-405**: Post-launch: ≥ 25% of cancellations with matching waitlist entries are re-booked within 60 minutes.
- **SC-406**: 100% of chrome string keys resolve in both launch locales (automated coverage gate).

## Out of Scope

- MCP server, external agent APIs, and webhooks/OpenAPI surface (post-release; REST first per mcp-server-research).
- Any LLM-powered feature (receptionist, NL parsing, content generation) — post-launch behind a cloud-provider abstraction only; local LLM/embeddings are architecturally forbidden on the ≤500 MB instance.
- No-show risk prediction (requires ≥ ~1000 bookings of historical data).
- All 003.2 capability packs (quotes, party/journey, documents, compliance, imports, goods/inventory, payment plans) — tracked in `backlog-carried-over-0032.md`.
- Portable reviews, marketplace/commission mechanics, native mobile apps, multi-currency switching per instance (one currency per instance).

## Assumptions

- Ukrainian ships post-launch as a data-only addition (dictionaries + native review), per user decision.
- Email fallback uses an external email provider chosen at planning stage; no self-hosted mail (business-plan blacklist).
- Waitlist offers are Telegram-only at launch (email fallback applies to confirmations, not offers).
- No-show protection is deposit-policy-based; crypto rails have no card-style pre-authorization and none is emulated.
- Custom-field types are limited to the four launch types; no form-builder UI beyond definitions.
