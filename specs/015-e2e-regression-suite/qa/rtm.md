# RTM-lite — 015-e2e-regression-suite (T1540)

| Requirement | Test file | Test(s) |
| --- | --- | --- |
| FR-1501 (Composite journey e2e) | `tests/e2e/composite-booking.e2e.spec.ts` | journey (checkboxes → Σ → container grid → items[] → OTP → itemized confirmation) · cache isolation · composite 409 race |
| FR-1502 (Money surfaces + gateway gate) | `tests/e2e/money-surfaces.e2e.spec.ts` | DEPOSIT basket Σ → DepositPayment fake-ветка · NONE absence · legacy itemId fallback |
| FR-1503 (Token pages e2e) | `tests/e2e/token-pages.e2e.spec.ts` | cancel one-time + replay 409 · composite reschedule container grid · acknowledge |
| FR-1504 (Trust fast path e2e) | `tests/e2e/trust-fast-path.e2e.spec.ts` | same-email no-OTP · mismatched email → OTP |
| FR-1505 (Waitlist/Admin/i18n e2e) | `tests/e2e/waitlist-admin-i18n.e2e.spec.ts` | closed-day waitlist join · approvals items (OWNER) · ru/en keys |
| FR-1506 (Fixtures канон) | `tests/helpers/seed-booking.ts` | used by every suite (XFF / unique dates / cleanup) |
| FR-1507 (Config fix) | `playwright.config.ts` | baseURL + `webServer.env E2E_GATEWAY=fake` (every run) |
| FR-1508 (Prerequisite UI fixes) | регрессионно покрыты | composite journey (AG-F2.1 grid) · money (AG-F2.2 lookup) · token-pages (AG-F5 picker) · /book (AG-F4.1) |
| FR-1509 (Rate-limit isolation) | все сьюты | unique `x-forwarded-for` per context — сьют проходит без 429 |
| NFR-1501..1506 | `T1541` прогон | `pnpm test` (int 232 + e2e) · ≤10 мин · 0 внешних вызовов · testid-канон |

Review-fix traceability: AG-F1 → T1501/FR-1502 · AG-F2 → T1504/FR-1508 · AG-F3 → T1503/FR-1509 · AG-F4 → T1503+T1504/FR-1508 · AG-F5 → T1520/FR-1508 · AG-F6 → T1520+T1530/NFR-1506 · AG-F7 → `qa/waiver.md`.
