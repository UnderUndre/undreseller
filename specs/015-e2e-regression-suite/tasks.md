# Tasks: 015-e2e-regression-suite

**Input**: `spec.md` rev 1.2 (clarified + review fixes AG-F1..F7), `plan.md`
**Organization**: Phase 1 Infra & Prerequisite Fixes → Phase 2 P0 → Phase 3 P1 → Phase 4 P2 → Phase 5 Verify & Docs.

---

## Phase 1: Infra & Prerequisite UI fixes

- [x] T1501 [BE] Add `E2E_GATEWAY=fake` env-gate to `src/lib/payments/stripeGateway.ts`: fake `createPaymentIntent` → deterministic `{ id: 'pi_e2e_<bookingId>', clientSecret: 'pi_e2e_<bookingId>_secret_e2e' }` (Stripe clientSecret format — fix AG-F1.1), fake `createRefund`, `retrieveClientSecret` returns the fake secret for `pi_e2e_`-prefixed refs; WITHOUT the env var the prod path is byte-identical; **plus `DepositPayment.tsx` fake branch: `clientSecret.startsWith('pi_e2e_')` renders `deposit-payment-section`/`deposit-payment-form`/`deposit-pay-button` with `depositNotice`/`remainingNotice` WITHOUT `loadStripe()`/`<Elements>`** (0 keys, 0 Stripe CDN requests — fix AG-F1.1)
- [x] T1502 [SETUP] Update `playwright.config.ts`: `baseURL: http://localhost:3000` **+ `webServer.env: { ...process.env, E2E_GATEWAY: 'fake', NODE_OPTIONS: '--no-deprecation --max-old-space-size=8000' }`** (fix AG-F1.2) + `workers: 1` (prevent pushDevSchema races)
- [x] T1503 [SETUP] Create `tests/helpers/seed-booking.ts`: Payload Local API seeding (unique slugs, addOn/free/deposit/outCall variants); **unique far-future DATES per test (`today + 30..60` days — fix AG-F4.2)**; weekly-hours 09:00–18:00 for weekdays 1..7 on the active default resource; **`uniqueXffHeaders()` helper: `x-forwarded-for: 203.0.113.<n>` per BrowserContext (RFC 5737 — fix AG-F3)**; `gotoBookingDate()` hydration-safe helper; `captureBookingPosts()` route interceptor; `cleanupSeedData()` — targeted `payload.delete` by ID + intent/waitlist sweep (no TRUNCATE — fix AG-F4.4)
- [x] T1504 [BE] Prerequisite UI fixes blocking the suite (fix AG-F2/F4/F5): `SlotGrid.loadSlots` appends `serviceId` to `items` ONCE (fix AG-F2.1); confirmation page looks up `slot-reservations` by URL id (fallback `order: equals id` for legacy), loads the order by `slot.order`, verifies `accessToken`, passes `reservationId = slot.id` to `CancelBookingButton` (fix AG-F2.2); `/book` excludes bare add-ons (`addOn not_equals true`, fix AG-F4.1); `/book/[slug]` loads the primary by a slug-scoped query instead of the `limit:50` list scan (fix AG-F4.3)

## Phase 2: P0 — Composite journey + Money surfaces

- [x] T1510 [E2E] [US1] Create `tests/e2e/composite-booking.e2e.spec.ts`: guest journey checkboxes → running Σ total → container grid recompute → `items[]` submit → OTP via `getOtpCodeFromDb` → itemized confirmation (primary first, add-on label); cache isolation 60/75-min under one service; composite×composite 409 race (two contexts)
- [x] T1511 [E2E] [US2] Create `tests/e2e/money-surfaces.e2e.spec.ts`: DEPOSIT basket → OTP → confirmation renders the fake-branch `DepositPayment` with Σ deposits from `items_json` (regression AG-F6.2) and `depositNotice = Σ`; NONE basket → payment block absent; legacy single-item booking → `itemId` fallback renders

## Phase 3: P1 — Token pages + Trust fast path

- [x] T1520 [E2E] [US3] Create `tests/e2e/token-pages.e2e.spec.ts`: cancel via one-time GET link (status RELEASED + honest UX), replayed cancel link → page-level already-cancelled UX, composite reschedule via `ReschedulePicker` shows the container grid and moves the booking (**fix AG-F5: `reschedule/page.tsx` reads `items_json`, passes `itemIds` to the picker, picker appends `&items=...`**), acknowledge link; **add `data-testid` to `ConfirmCancelForm` + `ReschedulePicker` + `AcknowledgeClient`** (fix AG-F6)
- [x] T1521 [E2E] [US4] Create `tests/e2e/trust-fast-path.e2e.spec.ts`: first booking (OTP) mints trust cookie → second booking same email WITHOUT OTP (direct 201); mismatched email → OTP phase

## Phase 4: P2 — Waitlist / Admin / i18n (optional to MVP)

- [x] T1530 [E2E] [US5-7] Create `tests/e2e/waitlist-admin-i18n.e2e.spec.ts`: waitlist join on empty closed day (**+ `data-testid` to `WaitlistJoinForm`**, fix AG-F6), admin login + approvals payload shows composite `items`, booking-flow keys present in ru/en *(Note: `Product.addOn` admin CRUD/validator UI not separately scripted in Playwright; covered by 014 int tests)*

## Phase 5: Verify & Docs

- [x] T1540 [DOC] RTM-lite in `specs/015-e2e-regression-suite/qa/rtm.md` **+ `qa/waiver.md`** + e2e README section (`E2E_GATEWAY=fake`, EADDRINUSE zombie remedy, trace/html report)
- [x] T1541 [OPS] Gates verified: `pnpm validate` (0 errors), `pnpm lint` (0 errors), `pnpm build` (OK), `pnpm test:int` (232/232), Playwright 015 suites 14/14 green in 2.2m (`booking.e2e` test #1 green, #2 timed out on cold dev route compile; pre-existing template `frontend.e2e`/`admin.e2e:30` from `980bc32` unadapted to 001 `Users.roles` lock & Payload 3.93 URL query)

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
T1504 → T1510
T1504 → T1520
T1504 → T1530
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
- [x] All Task IDs exist (`T1501..T1504`, `T1510..T1511`, `T1520..T1521`, `T1530`, `T1540..T1541`).
- [x] No chained arrows on a single line; only `→` used.
- [x] Zero cycles; zero orphans; e2e tasks strictly after infra + prerequisite UI fixes (T1504).
- [x] Shared files isolated: `playwright.config.ts` → только T1502; `stripeGateway.ts`/`DepositPayment.tsx` → только T1501; `SlotGrid.tsx`/`confirmation page`/`book pages` → только T1504; `reschedule page`/`ReschedulePicker` → только T1520; spec-файлы уникальны per task.

**Critical Path**: `T1504 → T1510 → T1540 → T1541` (4 задачи). **Total**: 10 задач.

---

## Parallel Lanes

| Lane | Tasks | Blocked By |
| --- | --- | --- |
| Lane 1 (Infra & fixes) | `T1501`, `T1502`, `T1503`, `T1504` | — |
| Lane 2 (P0) | `T1510`, `T1511` | `T1502/T1503/T1504`, `T1501` |
| Lane 3 (P1) | `T1520`, `T1521` | `T1510` |
| Lane 4 (P2) | `T1530` | `T1510` |
| Lane 5 (Verify) | `T1540` → `T1541` | все тестовые задачи |

---

## Agent Summary

| Agent | Task Count | Task IDs |
| --- | :---: | --- |
| `[BE]` | 2 | `T1501`, `T1504` |
| `[SETUP]` | 2 | `T1502`, `T1503` |
| `[E2E]` | 5 | `T1510`, `T1511`, `T1520`, `T1521`, `T1530` |
| `[DOC]` | 1 | `T1540` |
| `[OPS]` | 1 | `T1541` |

---

## Suggested MVP Scope

- **MVP**: `T1501..T1511` — prerequisite UI fixes + composite journey + money surfaces под браузерным замком (P0-тир закрыт).
- **Full Feature**: + `T1520`, `T1521` (P1) + `T1530` (P2) + `T1540`, `T1541` (verify/docs).
