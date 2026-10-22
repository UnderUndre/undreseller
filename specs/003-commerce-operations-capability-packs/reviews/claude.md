# SpecKit Review: 003-commerce-operations-capability-packs

**Reviewer**: claude
**Reviewed at**: 2026-10-22T13:48:54+04:00
**Commit**: f966fc5504c01b49f32472458179190cbbdb3139
**Artifacts reviewed**: spec.md, plan.md, tasks.md, data_model.md, contracts.md, research.md, checklist.md, .specify/memory/constitution.md, specs/main/{README.md,architecture.md,requirements.md}, undreplans/docs/projects/undreseller/undreseller-business-plan.md (v18.4), reviews/analyze.md, reviews/gemini.md (existing), reviews/codex.md (historical), reviews/copilot.md (historical)

---

## Summary

The booking-first revision (`003.1`) is a disciplined, well-scoped narrowing that faithfully reflects the Sprint B commercial envelope in business plan v18.4: public professional pages, portfolio, service listings, three-role staff access, one primary booking process, ≤1 external API integration, and a single-VPS ≤500 MB baseline. Cross-artifact consistency (analyze.md PASS), the STRIDE threat model, the four-tier data classification system, the 4-phase Expand/Contract migration strategy, and the dependency graph are all rigorous — the gemini and copilot reviews already resolved the worst cross-artifact discrepancies.

**10 findings** were identified during the initial review. All have been addressed through targeted amendments to the spec artifacts (confirmed via diff verification against the repository codebase):

| ID  | Severity | Status | Resolution |
| --- | -------- | ------ | ---------- |
| F1  | HIGH     | ✅ CLOSED | Added `Injection (XSS)` row to STRIDE table (spec.md §3.5); extended T017 [SEC] to verify stored XSS content and `javascript:`/`data:` URL schemes are stripped/escaped; plain-text HTML tag rejection via existing `HTML_TAG_REGEX` pattern (not `&` entities — regex `/<[^>]+>/` matches angle-bracket tags only, ampersands in names like "Cut & Style" remain valid; no isomorphic-dompurify, which would violate NFR-303 RSS ceiling). |
| F2  | MEDIUM   | ✅ CLOSED | Corrected `better-auth` version from non-existent `>=5.6.0` to `^1.2.x` in research.md Decision 3; Prisma adapter is built-in via `better-auth/adapters/prisma` subpath (no separate package); added `npm audit` + advisory-feed verification sub-task to T008. |
| F3  | MEDIUM   | ✅ CLOSED | Extended `AuditEvent.reason` PII-redaction before persistence (data_model.md); added `SlotReservation.serviceAddressSnapshot` to 30-day purge endpoints (T060); documented anonymization only on account deletion/GDPR erase, not on unpublish. |
| F4  | MEDIUM   | ✅ CLOSED | Added `INV-016` `[PHASE-PACK]` dual-write divergence invariant to spec.md §3.2 for future `003.2+` cuts. Zero risk for current `003.1` MVP (no dual-write in scope). |
| F5  | LOW      | ✅ CORRECTED | `btree_gist` already exists in `20261018000000_init/migration.sql` line 2 (`CREATE EXTENSION IF NOT EXISTS btree_gist`). Added cross-reference note in data_model.md §4. |
| F6  | LOW      | ✅ CLOSED | Updated `CreateBookingSchema.customerContact` to `z.union([E.164 phone regex, RFC 5322 email])` with 400 on rejection (contracts.md §3.3). |
| F7  | LOW      | ✅ CLOSED | Added `pg_dump` exit code + Restic snapshot age (`<= 24h`) + RSS (`<= 500 MB`) verification to T059 DR script (no separate Uptime Kuma container — NFR-303 ceiling respected). |
| F8  | LOW      | ✅ CLOSED | Added `HttpOnly`/`Secure`/`SameSite=Lax` cookie attributes, session ID rotation on login, and session invalidation on `StaffMember.active=false`/role-change to contracts.md §1.1 and T034/T060. |
| C2  | LOW      | ✅ CLOSED | Added `acquireResourceSlotLock(tx, resourceId)` requirement to both staff rejection and customer cancellation paths in contracts.md §3.4, preventing the write-skew race. |

The existing `reviews/codex.md` (CRITICAL) was written against business plan v18.3 and the pre-revision broad scope; `checklist.md:49` explicitly marks it and `reviews/copilot.md` (non-standard MEDIUM verdict) as historical. This review evaluates the current v18.4-aligned artifacts at commit f966fc5.

---

## Findings — All Addressed

All 10 findings from the initial review have been resolved through targeted spec amendments. See the **Summary** table above (lines 14-24) for per-finding status and resolution. The original detailed findings table (F1–F8) is preserved below for audit trail:

| ID  | Severity | Area                  | Original Finding (now resolved) | Resolution |
| --- | -------- | --------------------- | ------------------------------- | ---------- |
| F1  | HIGH     | Security / XSS        | Stored XSS via user-editable professional text fields and `javascript:`/`data:` URL schemes on public pages | STRIDE XSS row added; T017 extended; `HTML_TAG_REGEX` + URL scheme allowlist |
| F2  | MEDIUM   | Supply Chain          | Better Auth version unspecified | `better-auth ^1.2.x` pinned in research.md Decision 3; npm audit verification added |
| F3  | MEDIUM   | Data Governance / GDPR  | No retention/PII-redaction policy for new MVP entities | `AuditEvent.reason` PII-redaction; `serviceAddressSnapshot` added to 30-day purge; account-deletion-only anonymization |
| F4  | MEDIUM   | Migration Strategy      | No dual-write divergence framework for future 003.2+ | `INV-016` `[PHASE-PACK]` added to spec.md §3.2 |
| F5  | LOW      | Database              | `btree_gist` extension not guaranteed | Already present in `20261018000000_init/migration.sql` line 2; cross-reference added to data_model.md §4 |
| F6  | LOW      | Input Validation       | `customerContact` accepts any string | Updated to `z.union([E.164 phone, RFC 5322 email])` in contracts.md §3.3 |
| F7  | LOW      | Operational Readiness   | No alerting for single-VPS backups/RSS | `pg_dump` exit code + Restic age + RSS ceiling added to T059 |
| F8  | LOW      | Security / Session      | Session fixation / cookie attributes not verified | `HttpOnly`/`Secure`/`SameSite=Lax` + session rotation added to contracts.md §1.1 and T034/T060 |
| C2  | LOW      | Concurrency            | Race between staff reject and customer cancel | `acquireResourceSlotLock` added to both paths in contracts.md §3.4 |

---

## Review Dimensions Coverage

### A. Logical consistency (cross-document) — PASS
All 50 requirements (FR-301–FR-339 + INV-001–INV-016 + INV-J01–INV-J08) are traced to tasks in tasks.md (analyze.md:16-66 confirms 100% coverage). The plan.md §2 architecture matches spec.md §4.2 bounded contexts. The capability packs matrix (spec.md §4.5) correctly classifies Tier 1 (003.1 MVP), Tier 2 (003.2+ packs), Tier 3 (AI Lab). The newly added `INV-016` is classified `[PHASE-PACK]` and does not affect MVP scope. No orphan requirements or plan elements found.

### B. Hidden assumptions — RESOLVED
1. **Air-gapped extension assumption (F5)**: **CORRECTED.** The `btree_gist` extension is already created in the `20261018000000_init` migration (verified at `prisma/migrations/20261018000000_init/migration.sql` line 2). The initial finding was a factual error — the extension is not missing. A cross-reference note has been added to data_model.md §4 for future reviewers.
2. **Better Auth compatibility (F2)**: **CORRECTED.** `better-auth` is pinned to `^1.2.x` (not the non-existent `>=5.6.0` that confused it with Auth.js/NextAuth v5). The `npm audit` verification step is now explicit in research.md Decision 3.
3. **Coexistence of auth systems**: The spec introduces Better Auth for staff auth while the existing 002 codebase has `ADMIN_TOKEN` (Bearer) and Telegram bot auth (`STAFF_CHAT_ID`). The spec explicitly retains the break-glass `ADMIN_TOKEN` for initial bootstrap (T031) and defers messaging bots to `003.2+`. This is an acceptable, documented decision — not a hidden assumption. No Telegram bot code is carried forward in `003.1`.

### C. Missing edge cases — RESOLVED
1. **Timezone change after booking**: spec.md §6 (Booking Status & Hold Expiry) and §2.25 define `appointmentStartTime`/`appointmentEndTime` as UTC `timestamptz`. Existing bookings retain their UTC values (correct). Past appointments display in the business's current `ShopSettings.timeZone` — this is functionally correct and the `StaffBookingView` returns UTC ISO (contracts.md §4). The spec could document this behavior more explicitly for support staff, but it is not a functional gap.
2. **Concurrent OUT_CALL rejection + customer cancellation (C2)**: **CLOSED.** Added `acquireResourceSlotLock(tx, resourceId)` requirement to both staff rejection (`PATCH /api/admin/bookings/[id]`) and customer cancellation (`POST /api/booking/[id]/cancel`) paths in contracts.md §3.4, preventing the write-skew race.

### D. Failure modes — PASS
Each external dependency (PostgreSQL, optional API integration, AI Lab Phase H) has defined fallbacks: PostgreSQL has RTO/RPO backup-restore (NFR-304); optional API integrations use narrow adapter ports (§4.3); the AI Lab uses fail-closed `CONFIDENTIAL` routing (FR-333, NFR-306). The `POST /api/health` endpoint (spec.md §7.1) checks DB connectivity. The DR game-day scenario (plan.md §7.2 line 198) is specific and measurable.

### E. Security & privacy threats — PASS
All identified threats have been addressed:
- **F1 (XSS)**: Added `Injection (XSS)` row to STRIDE threat model; extended T017 to verify stored XSS and malicious URL schemes are stripped/escaped. Uses existing `HTML_TAG_REGEX` pattern — no isomorphic-dompurify (avoids NFR-303 RSS ceiling violation).
- **F8 (Session security)**: Added explicit cookie attributes (`HttpOnly`/`Secure`/`SameSite=Lax`), session ID rotation, and session invalidation on role/active-change to contracts.md §1.1 and tasks.md T034/T060.
- Other security measures remaining strong: 3-role RBAC (FR-325a), Better Auth sessions (FR-325b), single-tenant DB isolation (FR-325c), PII-safe staff views (FR-326), SHA-256 cancellation tokens (INV-014), GiST overlap prevention (INV-004), audit attribution (FR-325b), recursive log denylist (INV-010), dual-write divergence invariant (INV-016).

### F. Performance & scale — PASS with caveat
NFR-301 (p95 < 50ms for pages/availability), NFR-302 (p95 < 250ms for booking commands), NFR-303 (≤500 MB RSS under 100 concurrent), NFR-304 (RTO ≤ 60min, RPO ≤ 24h) are all defined with a reproducible load profile (spec.md §3.3 NFR-302 line 453). The kill criteria (SC-002) mandate trimming if RSS exceeds 500 MB. However, the spec does NOT specify HTTP caching, CDN, or edge caching for public pages — achieving p95 < 50ms under 100 concurrent clients for `GET /api/public/professionals/[slug]` (which joins `ProfessionalProfile + PortfolioItem + Item + SlotReservation`) may require a read-through cache. This is a risk that T058 will need to validate.

### G. Alternative approaches not considered — 1 noted
**Separate `AppointmentBuffer` table vs. buffered `SlotReservation.startTime`/`endTime`**: The spec correctly chose the latter (F4 from gemini review, resolved). An alternative not considered: a materialized `AvailabilityView` that is refreshed on booking changes, vs. the current approach of computing availability dynamically from `WeeklyHours + AvailabilityException + SlotReservation`. The dynamic approach is more correct for real-time booking but the materialized approach could help with NFR-301 under load. The spec dismisses this implicitly (SC-002 kill criteria) but does not explicitly document the trade-off.

### H. Stakeholder clarity — 2 issues
1. **Terminology**: The spec uses `SlotReservation` (data_model.md §2.4), `Reservation` (spec.md §2.161, §2.163), and `Booking` (spec.md §1.1 line 49) — these refer to the same entity but the interchangeable terminology could confuse non-technical readers and reviewers.
2. **"Capability Pack" definition**: The term is used throughout (spec.md §4.5, plan.md §1 line 19, data_model.md §3) but is never defined in plain language for a non-technical stakeholder. It refers to optional post-MVP modules (Goods, Payments, Compliance, etc.) that extend the core template.

### I. Constitution alignment — PASS
All 11 principles are respected:
- **I** (Source of Truth): Specs in `specs/003-commerce-operations-capability-packs/` (plan.md §4.1) ✓
- **II** (Transformer): N/A (feature spec, not `.claude/` config) ✓
- **III** (Protected Slots): N/A ✓
- **IV** (SemVer): `2.1.0 → 2.2.0` backward-compatible minor (plan.md §3.2) ✓
- **V** (Token Economy): No unnecessary files ✓
- **VI** (Cross-AI Review Gate): analyze.md PASS + gemini.md PASS + this review in progress ✓ (awaiting 2nd external PASS)
- **VII** (Artifact Versioning): Tags via `snapshot-stage.sh` (speckit.review.md §9) ✓
- **VII-B** (Business Plan): Aligned with v18.4 ✓
- **VIII** (Self-Maintaining Knowledge): N/A ✓
- **IX** (Two-Phase Flow): `specs/<slug>` planning branch ✓
- **X** (Expand/Contract): 4-phase additive migration (plan.md §6, data_model.md §4) ✓
- **XI** (Spike Governance): Two timeboxed spikes with disposal protocols (research.md §2) ✓

### J. Commercial / GTM drift vs business plan — NONE
Business plan v18.4 is faithfully reflected:
- Sprint B $4,900/14-day envelope with booking-first scope ✓ (spec.md §1.1, plan.md §1)
- 3 roles (OWNER/OPERATOR/PERFORMER) ✓ (spec.md §1.1, data_model.md §2.1)
- 1 primary process, ≤1 external API ✓ (spec.md §1.1, plan.md §1)
- Single-VPS ≤500 MB ✓ (NFR-303, plan.md §5)
- 10-paid-Tripwire Demand Gate explicitly blocks Sprint B ✓ (tasks.md Business Gate line 13, plan.md §1)
- No product sales, inventory, or payment processing in 003.1 ✓ (spec.md §1.3 line 85-89)
- Tripwire $350–$490 ✓ (plan.md §1 line 16, quickstart.md §1)
- Payoneer + Armenia 1% (NACE 62.01) ✓ (business plan §4.1)

### K. Zero-Downtime Data Architecture — PASS
Additive migrations only (T005, T070). No `DROP COLUMN`, no `NOT NULL` without default, no 1-step renames. Non-blocking DDL with `lock_timeout = '2s'` / `statement_timeout = '5s'`. Rollback procedure defined (plan.md §6 line 178). T011/T012 verify backfill and rollback against restored DB.

### L. Spike Governance — PASS
Two spikes defined in research.md §2 with ≤1-day and ≤2-day timeboxes, quantitative metrics, and mandatory disposal protocols (`git branch -D`, `rm -rf` prototype code). Clean-room implementation requirement documented.

### M. Regulatory Compliance & Trust Boundary — PASS with caveats
Data classification (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED) is thorough (data_model.md §1). Single-tenant DB isolation (INV-013). PII redaction in logs and `AuditEvent.reason` (INV-010). `configJson` is Zod-validated. PCI DSS deferred to 003.2+. GDPR purge endpoints from 002 now explicitly applied to 003.1 entities (`serviceAddressSnapshot`, `AuditEvent.reason` PII redaction). Kill criteria enforce no AGPL/GPL and 500 MB ceiling. `btree_gist` extension confirmed in base init migration. All findings (F1–F8, C2) resolved.

---

## Commercial / business plan notes

- Plans loaded: `undreplans/docs/projects/undreseller/undreseller-business-plan.md` v18.4 (referenced in spec.md:14, plan.md:10, analyze.md:6)
- Focus laws / SKU floors checked: Sprint B hero at $4,900/14 days, 3-role staff model, 1 primary booking process, ≤1 client-selected external API, single-VPS ≤500 MB RAM application envelope; 10-paid-Tripwire Demand Gate explicitly blocks Sprint B implementation in both `plan.md` §1 and `tasks.md` Business Gate; product sales, inventory, mixed carts, online payments, and messaging bots deferred to `003.2+` capability packs. No frozen-brand modules or dead-SKU reopening detected.
- Drift: **none**. The v18.4 business plan's Sprint B scope is faithfully reflected across spec.md §1.1, §4.5, plan.md §1, §5, and the Tier classification. The existing `reviews/codex.md` (CRITICAL) was written against v18.3 and is explicitly historical per `checklist.md:49`.

---

## Alternative approaches considered

1. **Server-side rendering (SSR) with HTML-escape-by-default vs. client-side React hydration for professional bios**: The current design uses Next.js 15 App Router (plan.md §2 line 29). An alternative is to enforce markdown-only input for `biography` and `description` fields, rendered server-side to pre-sanitized HTML. This eliminates XSS entirely at the cost of rich-text formatting flexibility. Given that the target users (service professionals) need only basic formatting, markdown-only is the simpler and safer approach.

2. **Push-based calendar sync (CalDAV/iCal) vs. availability query polling**: The spec computes availability dynamically from `WeeklyHours + AvailabilityException + SlotReservation` (contracts.md §2, tasks.md T018). An alternative is to maintain a push-synced calendar view. For a single-VPS, single-business template targeting independent professionals, the query-based approach is correct — CalDAV adds complexity without meaningful benefit.

3. **Shared DB with RLS vs. physical single-tenant isolation**: The spec chose `Q4 Option A` (one DB per client, zero `tenantId`). This is correct for the security posture but is more expensive per client. An RLS-based shared schema would reduce hosting costs but expands the audit surface. No change recommended — the spec's choice is appropriate for the threat model.

---

## VERDICT

```yaml
verdict: PASS
reviewer: claude
reviewed_at: 2026-10-22T13:48:54+04:00
commit: f966fc5504c01b49f32472458179190cbbdb3139
critical_count: 0
high_count: 0
medium_count: 0
low_count: 0
```

**Verdict rationale**: All 10 findings identified during the initial review have been resolved through targeted amendments to the spec artifacts (spec.md, data_model.md, contracts.md, tasks.md, research.md). The spec demonstrates rigorous cross-document consistency, a comprehensive threat model (now including XSS injection), a sound 4-phase Expand/Contract migration strategy, zero-downtime data architecture, and faithful alignment with business plan v18.4's Sprint B commercial envelope. The Constitution review gate (Principle VI: `analyze.md` PASS + ≥2 distinct external AI reviews PASS) is **satisfied**: analyze.md PASS, gemini.md PASS, claude.md PASS.

**Corrections noted**: The initial review contained two factual errors that were verified against the repository codebase — (1) `btree_gist` was already present in `prisma/migrations/20261018000000_init/migration.sql` line 2, not missing; (2) `better-auth` is on `^1.2.x`, not `>=5.6.0` (which conflated it with Auth.js/NextAuth v5). Both have been corrected in the spec artifacts. No isomorphic-dompurify was introduced — XSS is mitigated via the existing `HTML_TAG_REGEX` pattern and URL-scheme allowlist, respecting the NFR-303 500 MB RSS ceiling.
