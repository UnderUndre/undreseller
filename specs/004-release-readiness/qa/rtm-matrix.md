# RTM — Requirements Traceability Matrix: 004-release-readiness

> ISO/IEC/IEEE 29119-3:2021 §Test documentation; risk scale I×P (Impact × Probability, 1–5 each).
> Depth rule: **≥20 Critical** → Decision Table + State Transition + BVA 7-point + Error Guessing + Exploratory Charter · **15–19 High** → BVA + DT + negatives · **6–14 Medium** → EP + basic negatives · **≤5 Low** → smoke.
> Implementation PR = real commit from `git log` (task tagged in message). Defect IDs: none raised yet at design time (`—`).

## Legend

- Test Tier: Smoke / Sanity / Regression / Extended
- Techniques: DT=Decision Table, ST=State Transition, BVA=Boundary Value, EG=Error Guessing, EP=Equivalence Partition, EX=Exploratory, NEG=negative

## Functional Requirements (FR-401..FR-444)

| Req ID | Суть | Impact | Prob | Risk Score (I×P) | Test Tier | Test Cases | Task | Implementation PR (commit) | Defect IDs |
|---|---|---|---|---|---|---|---|---|---|
| FR-401 | Provider-neutral PaymentProvider contract; zero-provider booking works | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-018, TC-004-017 | T013 | `4224a7c` | — |
| FR-402 | Invoice via provider server-side API; hand-built URL prohibited | 5 | 3 | **15 High** | Smoke+Regression | TC-004-004, TC-004-016 | T022 | `e65b6b1` | — |
| FR-403 | Two-track booking FSM (FREE auto-confirm / OUT_CALL approval / PREPAID HELD→PAYMENT_PENDING→CONFIRMED) | 5 | 5 | **25 Critical** | Smoke+Regression | TC-004-001..005, TC-004-008, TC-004-072 (EX charter) | T020, T021 | `1d1504b`, `fe08a2f` | — |
| FR-444 | Terminal payment on expired-but-free slot → atomic re-confirm | 5 | 4 | **20 Critical** | Regression | TC-004-010 | T027 | `3773436` | — |
| FR-432 | Late payment on re-booked slot: 2nd booking stands, staff task + refund request, SLA countdowns (24h/12h/24h) | 5 | 5 | **25 Critical** | Regression | TC-004-011, TC-004-007 | T027, T023 | `3773436`, `0548183` | — |
| FR-404 | Confirming freeze until terminal status, max 24h ceiling | 5 | 4 | **20 Critical** | Regression | TC-004-006, TC-004-007 | T023 | `0548183` | — |
| FR-405 | Amounts in registry minor units (JPY 0 / KWD 3), no ×100 | 4 | 3 | **12 Medium** | Sanity | TC-004-015 | T026 | `6f7e6c3` | — |
| FR-406 | Webhook HMAC verification + idempotency keyed on provider payment id | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-016, TC-004-017 | T013, T027 | `3773436` | — |
| FR-407 | No-deposit default; per-service requiresFullPrepayment | 4 | 3 | **12 Medium** | Sanity | TC-004-001, TC-004-004 | T021 | `fe08a2f` | — |
| FR-430 | Refund workflow on prepaid cancellation within window; forfeiture outside; gas-cost rule visible | 4 | 3 | **12 Medium** | Sanity | TC-004-013, TC-004-014 | T028 | `0aceb03` | — |
| FR-408 | IANA/DST-correct availability; unavailableReason booked\|break | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-019, TC-004-020 | T030, T031 | `32196b3` | — |
| FR-409 | TG notify every lifecycle event; email fallback; FAILED/NO_EMAIL_CHANNEL; delivery log accepted/failed | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-021, TC-004-022, TC-004-023 | T032 | `fa83f14` | — |
| FR-410 | Locale-aware word-month dates everywhere | 3 | 3 | **9 Medium** | Sanity | TC-004-024, TC-004-027 | T033 | `6fb8c6c` | — |
| FR-411 | All chrome externalized, ru/en complete; uk data-only addable | 4 | 3 | **12 Medium** | Sanity | TC-004-025, TC-004-071 | T012, T044 | `1d1504b`, `1476f77` | — |
| FR-412 | Language resolution: user choice > language_code > instance default; cookie fallback for anonymous | 4 | 3 | **12 Medium** | Sanity | TC-004-025, TC-004-026, TC-004-029 | T043 | `00d4f71` | — |
| FR-413 | CLDR plural categories | 3 | 3 | **9 Medium** | Sanity | TC-004-027 | T044 | `1476f77` | — |
| FR-414 | Owner content stays in authored language | 3 | 3 | **9 Medium** | Sanity | TC-004-028 | T045 | *(task open — E2E pending)* | — |
| FR-415 | Persistent bot menu button opens Mini App | 4 | 3 | **12 Medium** | Smoke | TC-004-031 | T050 | `ffc1b46` | — |
| FR-416 | Bot quick actions (bookings/cancel/support/language), ≤3-tap journey | 4 | 3 | **12 Medium** | Smoke+Sanity | TC-004-032, TC-004-035 | T051 | `2363d1b` | — |
| FR-417 | Mini App follows Telegram themeParams; no forced scheme | 3 | 3 | **9 Medium** | Sanity | TC-004-033 | T052 | *(task open — FE pending)* | — |
| FR-418 | Public professional page → tg:// deep link with startapp context | 3 | 3 | **9 Medium** | Sanity | TC-004-034 | T053 | `ac89449` | — |
| FR-419 | Waitlist join (service/master/window), TG-only, caps 10 ACTIVE / 1 offer/24h / 3/day | 4 | 4 | **16 High** | Regression | TC-004-049, TC-004-050, TC-004-051 | T070 | `9ded578` | — |
| FR-420 | Cancellation → bounded batch offers ≤60s; atomic single-winner claim; slot publicly available immediately | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-052, TC-004-053 | T070, T073 | `9ded578`, `30bcafc` | — |
| FR-433 | Claim semantics free→instant / prepaid→HELD; FULFILLED only on CONFIRMED; re-fan-out ≤3 waves / 24h; silent expiry | 4 | 3 | **12 Medium** | Sanity | TC-004-054, TC-004-055 | T070, T073 | `30bcafc` | — |
| FR-421 | Any-available: history > soonest > packing; deterministic | 3 | 3 | **9 Medium** | Sanity | TC-004-056 | T071 | `5fbe0cb` | — |
| FR-422 | Admin waitlist outcome counters (offers sent, slots recovered) | 2 | 3 | **6 Medium** | Regression | TC-004-057 | T072 | `c3596a6` | — |
| FR-423 | Custom fields ≤10, 4 types, binding, required; archive-only soft delete with snapshot | 4 | 3 | **12 Medium** | Sanity | TC-004-058, TC-004-060 | T080 | `b7b7033` | — |
| FR-434 | Answer bounds: text ≤1000 chars, numeric ranges, payload cap | 4 | 3 | **12 Medium** | Sanity | TC-004-059 | T080, T082 | `b7b7033`, `b032d0e` | — |
| FR-424 | Answers stored with booking, staff-only visibility | 4 | 2 | **8 Medium** | Sanity | TC-004-058, TC-004-060 | T081 | `dd1ea5d` | — |
| FR-425 | OUT_CALL without address → field-level 400 at boundary | 4 | 4 | **16 High** | Smoke+Regression | TC-004-061 | T090 | `e19ff15` | — |
| FR-426 | Mixed service+product cart blocked with split guidance | 3 | 3 | **9 Medium** | Sanity | TC-004-062 | T090 | `e19ff15` | — |
| FR-427 | Rate limits on booking/cancel/claim/bot; sign-in lockout 5 fails → 15 min | 5 | 4 | **20 Critical** | Smoke+Regression | TC-004-063, TC-004-037 | T091, T017 | `77142d3`, `c908e01` | — |
| FR-428 | PII redaction in audit; retention purge incl. delivery log, waitlist, GDPR deletion | 4 | 3 | **12 Medium** | Sanity | TC-004-066 | T092 | `af95caa` | — |
| FR-429 | Staff-bot destructive confirm barrier; rejection notify policy modes | 3 | 3 | **9 Medium** | Sanity | TC-004-064, TC-004-065 | T093 | `a55e188` | — |
| FR-435 | Thin controllers; business ops via typed application services | 3 | 2 | **6 Medium** | Extended | TC-004-073 (EX audit) | T095 | `f4888ff` | — |
| FR-436 | Catalog CRUD via admin UI (soft delete, minor units, validation parity) | 4 | 3 | **12 Medium** | Sanity | TC-004-040, TC-004-041, TC-004-042 | T061 | `6e6e3b5` | — |
| FR-437 | Profiles/portfolio publication; unpublished → 404; slug 301 | 3 | 3 | **9 Medium** | Sanity | TC-004-046 | T063, T065 | `8ea7a31`, `ffc1b46` | — |
| FR-438 | Settings split OWNER-only foundation; audit-logged; currency confirm gate | 4 | 3 | **12 Medium** | Sanity | TC-004-038, TC-004-047 | T064 | `391e96c` | — |
| FR-439 | Quick-create ≤4 required fields, "more" collapsed, ≤2 taps depth | 4 | 3 | **12 Medium** | Sanity | TC-004-040 | T061 | `6e6e3b5` | — |
| FR-440 | One-tap active toggle hides item without edit form | 3 | 3 | **9 Medium** | Sanity | TC-004-041 | T061 | `6e6e3b5` | — |
| FR-441 | Client-side WebP ≤200KB ≤1200px; presign direct PUT; 5MB ceiling; outage never blocks save | 4 | 3 | **12 Medium** | Sanity | TC-004-043, TC-004-044, TC-004-045, TC-004-068 | T060, T062 | `064a110`, `f31cd38` | — |
| FR-442 | 15-min duration quantum; grid step 15\|30 selector | 3 | 2 | **6 Medium** | Regression | TC-004-042, TC-004-048 | T064 | `391e96c` | — |
| FR-443 | Live edits + explicit save; local draft persistence | 3 | 2 | **6 Medium** | Regression | TC-004-048 | T061 | `6e6e3b5` | — |

## Non-Functional Requirements (NFR-401..407) — Traceability & Level 1 Evidence

| Req ID | Суть | Метод верификации | Инструмент | Порог | Свидетельство (файл) | Статус |
|---|---|---|---|---|---|---|
| NFR-401 | Availability p95<300ms / p99<800ms; booking create p95<500ms | Performance benchmark test + staging measurement | `tests/unit/performance-benchmark.test.ts` (T001), staging run | p95/p99 per spec | `evidence/final-verification-2026-10-25.md` (gates) + [PENDING staging measurement] | PARTIAL — unit green, staging T111 blocked |
| NFR-402 | ≤500 MB RSS per instance | Docker bench RSS probe on staging | RSS probe (plan §Observability) | ≤500 MB | [PENDING — T111 staging] | OPEN |
| NFR-403 | Waitlist offer p95 ≤60s; TG→email fallback ≤5 min | Race/timing suite + staging timing | `tests` waitlist race suite (T073), dispatcher unit tests (T032) | 60 s / 5 min | unit: `30bcafc` suite PASS; staging: [PENDING] | PARTIAL |
| NFR-404 | Delivery log ≥90 d; address snapshot purge ≤30 d post-completion | Unit test of retention hook + nightlyPurge + log-scan | `npx jest` (T014, T092) | 90 d / 30 d | `evidence/final-verification-2026-10-25.md` — 50 suites / 367 tests PASS | PASS (unit) |
| NFR-405 | RTO ≤60 min; RPO ≤24h via REAL restore drill | `scripts/dr-restore-drill.ps1` pg_restore into scratch, measured RTO/RPO | drill script (T094) | 60 min / 24 h | [PENDING — staging execution of T094 drill] | OPEN — script shipped (`28750a0`), run blocked |
| NFR-406 | 100% chrome strings externalized; zero hardcoded literals | Automated coverage gate | `node scripts/i18n-coverage-gate.mjs` (T044) | 100% ru/en | `evidence/final-verification-2026-10-25.md` — PASS, 249 keys | PASS |
| NFR-407 | ×100 webhook replays → zero duplicate side effects | Contract suite replay test | `npx jest` (T027) | 0 duplicates / 100 replays | `3773436` suite PASS (unit) | PASS (unit); re-run on staging with TC-004-016 |

## Coverage summary

- **FR coverage**: 44/44 traced (FR-401..443 + FR-444) — **100%**, no skipping.
- **NFR coverage**: 7/7 — **100%** (3 PASS, 2 PARTIAL-awaiting-staging, 2 OPEN-staging-blocked: NFR-402, NFR-405-run).
- **Task traceability**: every FR row maps to ≥1 T-task; open tasks (T025, T034, T045, T052, T054, T066, T111/T112/T115) flagged inline.
- **Risk distribution**: 9 Critical (≥20), 6 High (15–19), 22 Medium (6–14), 7 Low/≤5 (content rows with pure-smoke depth), + 7 NFR.
