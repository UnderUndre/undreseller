# Implementation Plan: 004 Release Readiness

> "Тяжесть — это надёжно. Даже если не стрельнёт, таким всегда можно врезать по башке." — Борис Бритва (_Большой куш / Snatch_, в защиту монолита)
> "These walls are funny. First you hate 'em, then you get used to 'em. Enough time passes, you get so you depend on them." — _Побег из Шоушенка_
> "Scissors cuts paper, paper covers rock, rock crushes lizard... — Распределённый дедлок в микросервисах." — Шелдон Купер (_The Big Bang Theory_)

**Branch**: `004-release-readiness` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-release-readiness/spec.md` (v6, 9 user stories, FR-401..443)

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Release-hardening of the booking-first template for first public deployment: (1) money & booking integrity — provider-neutral `PaymentProvider` contract (003 FR-316 finally implemented), server-side invoice creation, explicit two-track booking FSM with crypto hold-freeze and UNDERPAID/late-payment resolution; (2) calendar & notification reliability — IANA timezone slot math, TG+email redundancy with delivery log; (3) i18n ru/en across all surfaces (uk post-launch); (4) hybrid Telegram experience — persistent menu button, bot quick actions, Mini App catalog/calendar/checkout with themeParams; (5) deterministic money features — waitlist auto-fill and any-available-staff; (6) custom booking fields; (7) privacy/abuse hardening closing 003 audit debts; (8) undesign token adoption completion; (9) mobile-first content-admin UI. All inside the existing boring monolith: one Next.js 15 container, PostgreSQL 16, ≤500 MB RSS.

## Technical Context

**Language/Version**: TypeScript 5.8, Node 22 (alpine), Next.js 15.2 App Router
**Primary Dependencies**: Prisma 6.4 + PostgreSQL 16; grammY 1.35 (2 bots); Inngest 3.40 (+ PG deadlineSweeper fallback); zod 3; **new**: `next-intl` (i18n, Apache-2.0), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2 presign, Apache-2.0), `browser-image-compression` (client WebP resize, MIT), transactional email SaaS adapter (Resend recommended `[COST]`, HTTP API — no new runtime dep). Existing: `@underundre/undesign` tokens (wired in 1b7bd23), better-auth **dependency removed** (see research decision D4).
**Storage**: PostgreSQL 16 (Prisma, GiST `slot_resource_no_overlap`); **Cloudflare R2** (S3-compatible, zero egress) for admin-uploaded media via presigned URLs — server never buffers image bytes; local-disk media prohibited.
**Testing**: Jest 29 + ts-jest (unit), Playwright 1.50 (e2e), NEW contract tests for PaymentProvider adapters (stubbed gateway lifecycle) and admin API validation parity.
**Target Platform**: Docker (`node:22-alpine`), single VPS Hetzner CPX42, Traefik v3, `REPLICA_COUNT=1`.
**Project Type**: Web application — single Next.js monolith (no new services; Conway check: solo dev → modular monolith is the only sane topology).
**Performance Goals**: availability query p95 < 300 ms / p99 < 800 ms; booking create p95 < 500 ms; waitlist offer dispatch p95 ≤ 60 s; FSM adds ≤ 150 ms p95 (spec kill-criteria).
**Constraints**: app RSS ≤ 500 MB (hard, business-plan); zero LLM/inference runtimes; GDPR market (outside RF); solo developer; additive-only migrations on live schema.
**Scale/Scope**: white-label one-instance-per-business; per instance: ≤ ~200 items, ≤ ~20 staff, ≤ ~2k bookings/mo (small-business profile).
**Security Surface & STRIDE Triggers**: payments (webhook HMAC, FSM), waitlist atomic claims, admin UI (RBAC, uploads presign), notification log (PII-adjacent) → STRIDE table below, mandatory.
**Database Migration Trigger**: schema modified (new tables + enum values + nullable columns) → 4-phase Expand/Contract required (see Database Migration Strategy + data-model.md).
**Supply Chain & Licensing**: MIT/Apache-2.0/BSD/ISC allowlist only (`config/oss-reuse-registry.json`); zero AGPL/GPL; new deps pass `scripts/verify-licenses.mjs`; `npm audit` zero High/Critical unmitigated.
**Research Spikes & Disposal**: three timeboxed spikes (themeParams↔undesign mapping; R2 presign E2E; i18n key-coverage AST gate) — all ≤2 days, quantitative acceptance, code destroyed after findings (see research.md §Plan Phase 0).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle | Status | Note |
|---|---|---|
| I. Source of Truth (`.claude/` authoritative) | PASS | No `.claude/` or generated-tree edits in this feature. |
| II. Transformer, Not Fork | N/A | No new AI-tool targets. |
| III. Protected Slots | N/A | No managed-file edits. |
| IV. SemVer 0.x | PASS | App is private (`"private": true`); no version bumps planned; no `chore: bump` commits. |
| V. Token Economy | PASS | No new agents/skills/commands introduced by this feature. |
| VI. Cross-AI Review Gate | ON TRACK | `/speckit.implement` blocked until `analyze.md` PASS + 2 external reviewer PASS — planned as explicit pre-implementation step. |
| VII. Artifact Versioning | PASS | `spec/v1..v6`, `clarify/v1` tagged; `plan/` and `tasks/` tags follow this commit. Git is the history; no `.history/` files. |
| VII-B. Business Plan Stage | PASS | External plan v18.4 (`undreplans/.../undreseller-business-plan.md`) read as constraint in specify; no ICP/SKU/pricing/gate delta → `unchanged` (recorded in specify report). ≤500 MB + white-label isolation honored. |
| VIII. Self-Maintaining Knowledge | PASS | `specs/main/architecture.md` updated by this plan (living spec). |
| IX. Two-Phase Review Flow | DEVIATION (accepted) | Repo-local speckit scripts create `NNN-slug` branches (003 pattern); constitution's `specs/<slug>` convention is upstream clai-helpers lineage. Grandfathered per IX; flagged for `/speckit.retrospective`. |
| X. Zero-Downtime Expand/Contract | PASS | data-model.md defines the 4-phase manifest; single-step breaking DDL prohibited. |
| XI. Spike Governance | PASS | 3 spikes timeboxed ≤2d with quantitative metrics and mandatory disposal (research.md). |

Post-Phase-1 re-check: no new violations introduced by design artifacts (contracts stay inside the monolith; R2 is external storage, not a new service topology).

## Project Structure

### Documentation (this feature)

```text
specs/004-release-readiness/
├── spec.md              # v6 — 9 user stories, FR-401..443
├── plan.md              # This file
├── research.md          # External UX/AI/MCP/content research + Plan Phase 0 engineering decisions
├── data-model.md        # Entities, FSMs, Expand/Contract manifest
├── quickstart.md        # Tracer Bullet scenario
├── contracts/           # Interface contracts
├── checklists/          # Specification quality checklist
├── 003-tasks-audit.md   # Audit of 003 [X] claims (input)
├── backlog-carried-over-0032.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root — monolith, existing tree + new paths)

```text
undreseller/
├── app/
│   ├── admin/                      # NEW: content-admin UI (US9)
│   │   ├── catalog/page.tsx        #   quick-create sheet, active toggles, ordering arrows
│   │   ├── team/page.tsx           #   professional profiles + portfolio + hours
│   │   └── settings/page.tsx       #   business settings (OWNER-only foundation section)
│   ├── api/
│   │   ├── admin/uploads/presign/route.ts   # NEW: presigned URL issuer (US9/FR-441)
│   │   ├── waitlist/               # NEW: join + claim (US5)
│   │   └── booking/…               # MODIFIED: FSM semantics, zod-refine OUT_CALL (US1/US7)
│   └── …                           # existing pages (i18n wrap, theme, menu deep links)
├── lib/
│   ├── payments/
│   │   ├── providerContract.ts     # NEW: PaymentProvider interface + registry (FR-401/435)
│   │   ├── nowpayments.ts          # MODIFIED: adapter implements contract; invoice API; confirming-freeze
│   │   └── stars.ts                # MODIFIED: adapter implements contract
│   ├── kernel/
│   │   ├── bookingFsm.ts           # NEW: two-track FSM transitions (pure, testable)
│   │   └── bookingService.ts       # MODIFIED: uses FSM; timezone-aware
│   ├── waitlist/                   # NEW: waitlistService (offer fan-out, atomic claim), slotPacker (any-available greedy)
│   ├── i18n/                       # NEW: request config, locale resolution (user > language_code > instance), ICU messages ru/en
│   ├── notifications/              # NEW: dispatcher (TG primary, email fallback), deliveryLog
│   ├── email/                      # NEW: transactional email adapter (provider-isolated)
│   ├── uploads/presign.ts          # NEW: R2 presign service
│   └── booking/windows.ts          # MODIFIED: IANA timezone math, DST, buffer reasons
├── components/
│   ├── admin/                      # NEW: QuickCreateSheet, ActiveToggle, ImageUploader (client resize)
│   └── …                           # existing components: i18n keys, base-* neutrals, themeParams
├── prisma/
│   └── migrations/
│       └── 20261025000000_004_release_readiness_expand/   # NEW (Phase 1 Expand, additive only)
├── scripts/
│   ├── backfill-004-language-defaults.ts   # NEW (Phase 2 backfill, idempotent)
│   └── dr-restore-drill.ps1        # NEW: real-restore DR drill (US7)
└── tests/
    ├── unit/                       # FSM, waitlist, slotPacker, i18n coverage, provider adapters (stubbed)
    └── e2e/                        # booking journey per US1 acceptance; waitlist claim race
```

**Structure Decision**: single Next.js monolith (existing). All new modules are library folders + routes inside it (`lib/` kernel extensions per FR-435 — services with typed contracts, thin HTTP/bot controllers). No new repositories, services, or worker processes; Inngest + built-in poller remain the only async machinery.

## Threat Modeling & Security Boundaries (STRIDE)

| Threat Category (STRIDE) | Target Component / Asset | Potential Attack Vector | Mitigation / Architecture Countermeasure |
| :--- | :--- | :--- | :--- |
| **S**poofing | Payment webhooks; waitlist claims; admin session | Forged NOWPayments callback; claim from non-offered chat; cookie theft | HMAC-SHA512 on raw sorted payload + `timingSafeEqual` (existing, regression-tested); claims bound to offer token + chat id; HttpOnly/Secure/SameSite session cookies, rotation on login (existing 003 semantics) |
| **T**ampering | Booking FSM transitions; amounts; custom-field answers | Client-side status manipulation; ×100 hardcode drift; oversized/injected answers | Server-authoritative FSM (client state never trusted); amounts in registry minor units only; zod caps (≤1000 chars) + sanitization before staff render |
| **R**epudiation | Staff content mutations; waitlist outcomes; notification history | "I never changed the price" / "client was never notified" | AuditEvent on every mutation (PII-redacted reason); NotificationDeliveryLog accepted/failed with timestamps; waitlist offer/claim records |
| **I**nformation Disclosure | Waitlist broadcasts; delivery log; address snapshots; presign URLs | Offers leaking other customers; PII in logs; stolen presign PUT | Offers contain zero cross-customer data; deny-list logger redaction extended to new logs; presign: short TTL, content-type/size conditions, single-object key; snapshot purge per retention |
| **D**enial of Service | Booking create/cancel; waitlist claim; presign endpoint; admin media | Slot-squatting via fake invoices; claim storms; presign flooding | Bounded hold TTL (15 min) + freeze-on-confirming only; rate limits per contact (FR-427); bounded waitlist batches; presign rate-limited + per-object quota; payload caps |
| **E**levation of Privilege | Admin UI vs RBAC; OPERATOR reaching foundation settings | PERFORMER accessing catalog mgmt; OPERATOR changing currency/payouts | Three-role guard at service boundary (FR-438 split enforced server-side, UI hides but server verifies); presign OWNER/OPERATOR-only |

## Database Migration Strategy (Expand/Contract)

> Full manifest with DDL sketches in `data-model.md`. Trigger: new tables (7), enum value additions (SlotReservation.status), nullable columns (Item.archivedAt, ShopSettings locale columns, StaffMember/User language preference).

- **Data Consistency Model**: ACID everywhere; booking/waitlist mutations inside the existing advisory-lock + GiST transaction pattern; no distributed transactions (R2 upload completes before DB writes the public URL).
- **Capacity & IOPS Bounds**: new tables are low-volume (waitlist ≤ hundreds/instance; delivery log ~5 rows/booking, 90-day retention with purge); dual-write overhead negligible (only locale-default backfill).
- **Compliance & Scope Isolation**: PII (addresses, contacts, custom answers) — GDPR retention/purge extended to NotificationDeliveryLog and BookingFieldAnswer; no cardholder data (crypto gateway redirect); audit reasons redacted pre-persist.
- **Phase 1 (Expand)** `20261025000000_004_release_readiness_expand`: additive only — `CREATE TABLE` WaitlistEntry, WaitlistOffer, CustomBookingField, BookingFieldAnswer, NotificationDeliveryLog, SlugRedirect, PaymentAllocationLink (adapter ledger link, nullable); `ALTER TYPE ... ADD VALUE` for SlotReservation.status (PAYMENT_PENDING, UNDERPAID, PENDING_APPROVAL — ADD VALUE is non-breaking, cannot run inside same tx as usage — separate migration statement); nullable columns `Item.archivedAt`, `ShopSettings.defaultLocale/enabledLocales`, `User* languageOverride` (or column on StaffMember-linked identity), `Item.requiresFullPrepayment BOOLEAN DEFAULT false`. All with `down.sql`.
- **Phase 2 (Dual-Write & Backfill)**: minimal — `scripts/backfill-004-language-defaults.ts` sets `ShopSettings.defaultLocale` from existing greeting/config heuristics; Item prepayment flag defaults false (no-deposit default). No legacy-column shadowing required: new features read new fields from day one.
- **Phase 3 (Cutover)**: feature flags (`CAPABILITY_PACKS_CONFIG` pattern) flip reads to FSM/payment-provider paths; telemetry watched for zero regression per NFR-401.
- **Phase 4 (Contract)**: remove the hand-built NowPayments URL branch and `×100` arithmetic (code-level contract, not DDL); drop nothing destructive at column level this release; schedule legacy `/api/booking/lock` vs `/api/booking` consolidation review for 005.
- **Rollback Path**: per-phase `down.sql` (verified by T012-lineage test); enum ADD VALUE is not reversible — mitigated by deploying enum expansion before code that writes the new values; feature-flag killswitch reverts reads to legacy paths without DDL.

## Observability, Recovery & Rollback Plan

### Observability & Telemetry

- **Metrics & SLIs**: p95/p99 latency for availability/booking endpoints (existing logger counters extended); waitlist dispatch latency (cancel→offer) p95 ≤ 60 s; payment webhook processing success/idempotency-duplicate counters; RSS ceiling probe (docker bench, existing).
- **Structured Logging**: existing deny-list logger; NEW log surfaces (delivery log, waitlist offers, presign issuance) go through the same redaction; zero PII/tokens verified by automated log-scan test (US7).
- **Distributed Tracing**: correlation IDs in inbox/outbox events (existing); full OpenTelemetry deferred post-release (recorded in backlog-carried-over, T068 lineage).
- **Health Checks & Probes**: `/api/health` extended with a cheap locale-config check (no secrets, no PII).

### Disaster Recovery & Rollback Strategy

- **Recovery Targets**: RTO ≤ 60 min, RPO ≤ 24 h (unchanged); PITR via nightly base + WAL.
- **DR GameDay Scenario**: `scripts/dr-restore-drill.ps1` performs an ACTUAL `pg_restore` into a scratch database and verifies business settings, items, staff, bookings, waitlist — records measured RTO/RPO and peak RSS. Replaces the fake-PASS stub (003 audit T059).
- **Rollback Triggers**: error rate > 1%, latency p95 > 2× baseline, migration deadlock, waitlist double-claim detected in telemetry.
- **Rollback Procedure**: feature-flag off → legacy read paths; deploy revert (image tag); down-migrations only for additive tables (safe drop); enum values remain (harmless unused).
- **Data Recovery Bounds**: PITR target 24 h; max tolerable drift: bookings (zero loss — transactional), delivery log (best-effort).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| IX branch naming (NNN-slug vs specs/slug) | Repo-local speckit scripts + 003 lineage consistency | Migrating mid-feature breaks snapshot tags and scripts for zero user value; deferred to retrospective |
| — | — | — |

Post-design note: no architecture violations — everything lands in the existing monolith; R2 and email SaaS are external dependencies behind thin adapters, not topology changes.
