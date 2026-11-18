# Tasks: 015-e2e-regression-suite

**Input**: `spec.md` rev 1.1 (clarified), `plan.md`
**Organization**: Phase 1 Infra → Phase 2 P0 (Composite + Money) → Phase 3 P1 (Tokens + Fast path) → Phase 4 P2 (Waitlist/Admin/i18n) → Phase 5 Verify & Docs.

---

## Phase 1: Infra

- [ ] T1501 [BE] Add `E2E_GATEWAY=fake` env-gate to the payments seam in `src/lib/payments/stripeGateway.ts`: fake `createPaymentIntent` → deterministic `{ id: 'pi_e2e_<bookingId>', clientSecret: 'cs_test_e2e' }`, fake `createRefund`, and `retrieveClientSecret` returns the fake secret for `pi_e2e_`-prefixed refs; WITHOUT the env var the prod path is byte-identical
- [ ] T1502 [SETUP] Set `baseURL: http://localhost:3000` in `playwright.config.ts` (additive only — webServer/retries/trace/reporter untouched)
- [ ] T1503 [SETUP] Create `tests/helpers/seed-booking.ts`: Payload Local API seeding of bookable services (unique slugs, addOn/free/deposit variants), resource + weekly-hours, unique hour-bucket `futureStart` helper (canon of int tests; no TRUNCATE — Via Negativa)

## Phase 2: P0 — Composite journey + Money surfaces

- [ ] T1510 [E2E] [US1] Create `tests/e2e/composite-booking.e2e.spec.ts`: guest journey checkboxes → running Σ total → container grid recompute (slot set differs from 60-min grid, fix AG-F3.1 visible) → `items[]` submit → OTP via `getOtpCodeFromDb` → itemized confirmation (primary first, add-on label); cache isolation 60/75-min under one service; composite×composite 409 race (two contexts)
- [ ] T1511 [E2E] [US2] Create `tests/e2e/money-surfaces.e2e.spec.ts` (depends on T1501): DEPOSIT basket → OTP → confirmation renders `<DepositPayment>` with Σ deposits from `items_json` (regression AG-F6.2); NONE basket → payment block absent; legacy single-item booking → `itemId` fallback renders

## Phase 3: P1 — Token pages + Trust fast path

- [ ] T1520 [E2E] [US3] Create `tests/e2e/token-pages.e2e.spec.ts`: cancel via one-time GET link (status RELEASED + honest UX), replayed cancel link → 409 UX, composite reschedule via `ReschedulePicker` validated against container duration (fix AG-F3.2), acknowledge link
- [ ] T1521 [E2E] [US4] Create `tests/e2e/trust-fast-path.e2e.spec.ts`: first booking (OTP) mints trust cookie → second booking same email WITHOUT OTP (direct 201); mismatched email → OTP phase

## Phase 4: P2 — Waitlist / Admin / i18n (optional to MVP)

- [ ] T1530 [E2E] [US5-7] Create `tests/e2e/waitlist-admin-i18n.e2e.spec.ts`: waitlist join on empty date, admin creates product with `addOn=true, durationMin=0` (014 validators in UI) + approvals list shows `items`, booking-flow keys present in ru/en

## Phase 5: Verify & Docs

- [ ] T1540 [DOC] RTM-lite (FR-1501..1507 → test files) in `specs/015-e2e-regression-suite/qa/rtm.md` + e2e README section (run instructions, EADDRINUSE zombie remedy, trace/html report)
- [ ] T1541 [OPS] Full `pnpm test` run (int 232 + all e2e), flake audit via trace-on-retry, speed budget ≤ 10 min local (excluding webServer cold boot)

---

## Dependency Graph

```text
T1501 → T1511
T1502 → T1510
T1503 → T1510
T1503 → T1511
T1503 → T1520
T1503 → T1521
T1503 → T1530
T1510 → T1520
T1510 → T1521
T1510 → T1530
T1510 → T1540
T1511 → T1540
T1520 → T1540
T1521 → T1540
T1530 → T1540
T1540 → T1541
```

### Graph Self-Validation
- [x] All Task IDs exist (`T1501..T1503`, `T1510..T1511`, `T1520..T1521`, `T1530`, `T1540..T1541`).
- [x] No chained arrows on a single line; only `→` used.
- [x] Zero cycles; zero orphans; all e2e tasks strictly after their infra dependencies.
- [x] Shared files isolated: `playwright.config.ts` → только T1502; `stripeGateway.ts` → только T1501; spec-файлы уникальны per task.

**Critical Path**: `T1503 → T1510 → T1540 → T1541` (4 задачи). **Total**: 9 задач.

---

## Parallel Lanes

| Lane | Tasks | Blocked By |
| --- | --- | --- |
| Lane 1 (Infra) | `T1501`, `T1502`, `T1503` | — |
| Lane 2 (P0) | `T1510`, `T1511` | `T1502/T1503`, `T1501` |
| Lane 3 (P1) | `T1520`, `T1521` | `T1510` |
| Lane 4 (P2) | `T1530` | `T1510` |
| Lane 5 (Verify) | `T1540` → `T1541` | все тестовые задачи |

---

## Agent Summary

| Agent | Task Count | Task IDs |
| --- | :---: | --- |
| `[BE]` | 1 | `T1501` |
| `[SETUP]` | 2 | `T1502`, `T1503` |
| `[E2E]` | 5 | `T1510`, `T1511`, `T1520`, `T1521`, `T1530` |
| `[DOC]` | 1 | `T1540` |
| `[OPS]` | 1 | `T1541` |

---

## Suggested MVP Scope

- **MVP**: `T1501..T1511` — composite journey + money surfaces под браузерным замком (P0-тир закрыт).
- **Full Feature**: + `T1520`, `T1521` (P1) + `T1530` (P2) + `T1540`, `T1541` (verify/docs).
