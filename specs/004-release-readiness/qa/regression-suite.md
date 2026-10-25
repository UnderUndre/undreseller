# Regression Suite — 004-release-readiness

> Suite composition from `test-cases.md`. Any Smoke failure blocks the release candidate; Sanity failures block unless waived by OWNER with a logged defect; Full Regression runs per release candidate.

## Environment prerequisites per suite

| Prerequisite | Smoke | Sanity | Full |
|---|---|---|---|
| Staging instance `SHOP_URL` + seed shop (items, profiles, staff accounts) | ✅ required | ✅ required | ✅ required |
| Telegram test bot + 2 client TG accounts (`@client_a` with email, `@client_b` without) | ✅ required (US4/US9 login/menu probes) | ✅ required | ✅ required |
| Crypto sandbox provider (NowPayments sandbox key) | ❌ not required (FSM covered by zero-provider + unit suite) | ✅ required for UAT-2-adjacent cases | ✅ required |
| R2 test bucket credentials | ❌ not required | ✅ required (image upload cases) | ✅ required |
| [DB] read-only/seed access (backdating for ceiling, caps, ranking) | ❌ | partial (slug 301, caps) | ✅ required |
| Resend/sandbox email provider + test inbox | ❌ | ✅ required | ✅ required |
| Build gates (jest/tsc/gates) runnable in CI | ✅ (automated TCs) | ✅ | ✅ |

## Smoke Suite — P0, ≤15 min, blocking (~12 cases)

Run order (server-cheap → TG → money-adjacent zero-provider):

| # | TC ID | Case | Time |
|---|---|---|---|
| 1 | TC-004-036 | Staff web login happy path | 1 min |
| 2 | TC-004-038 | OPERATOR foundation settings 403 | 1 min |
| 3 | TC-004-040 | Quick-create service ≤4 fields (skip photo) | 2 min |
| 4 | TC-004-041 | One-tap active toggle | 1 min |
| 5 | TC-004-001 | FREE track IN_CALL auto-confirm | 2 min |
| 6 | TC-004-002 | OUT_CALL → approve via staff bot | 2 min |
| 7 | TC-004-018 | Zero-provider booking end-to-end | 1 min |
| 8 | TC-004-031 | Bot menu button opens Mini App [TG] | 1 min |
| 9 | TC-004-025 | Locale switch ru/en | 1 min |
| 10 | TC-004-019 | DST slots Europe/Berlin (API probe) | 1 min |
| 11 | TC-004-061 | OUT_CALL no address → 400 | 1 min |
| 12 | TC-004-063 | 11th booking/min → 429 | 1 min |

Automated gate pre-flight (CI, before manual suite): `tsc --noEmit`, jest unit, i18n gate, design-token gate, license gate — any red = suite not started.

**Crypto-sandbox cases in Smoke: none.** Money-integrity smoke relies on the unit contract suite (T027) + TC-004-016/017 replay/signature probes run from CI against staging webhook URL if wired; full crypto smoke runs in Sanity.

## Sanity Suite — P1, ≤45 min

Everything in Smoke, plus (~33 min additional):

| Area | TC IDs | Notes |
|---|---|---|
| Money lifecycle [CRYPTO] | TC-004-004, 008, 009, 013 | invoice URL, finished→CONFIRMED, UNDERPAID, refund-in-window |
| Lockout [BND] | TC-004-037 | 5→15 min lockout (or stop after 6th attempt observed) |
| RBAC | TC-004-039 | PERFORMER 403 |
| Notifications [TG] | TC-004-021, 023 | email fallback + delivery history |
| Waitlist [TG] | TC-004-049, 052, 053 | join, offer ≤60 s, concurrent claims |
| Custom fields | TC-004-058 | 4 types + required block |
| Hardening | TC-004-062, 064 | mixed cart, reject barrier |
| Uploads [R2] | TC-004-043, 044 | type rejection + presign PUT |
| Slug/currency | TC-004-046, 047 | 301 redirect, currency confirm gate |
| i18n | TC-004-026, 027, 028 | de fallback, plurals, authored content |
| Theme | TC-004-033 | themeParams flip |

## Full Regression — P2/P3 (per release candidate, ~0.5 day)

- Sanity Suite **plus**: TC-004-003, 005, 006, 007, 010, 011, 012, 014, 015, 016, 017 (FSM/edge/crypto all)
- TC-004-020, 022, 024, 029, 030 (calendar/i18n remainder)
- TC-004-032, 034, 035 (hybrid journey remainder)
- TC-004-042, 045, 048 (admin remainder)
- TC-004-050, 051, 054, 055, 056, 057 (waitlist caps/ranking/counters)
- TC-004-059, 060, 065, 066 (fields/hardening remainder)
- TC-004-067 (DR drill — staging, ops), TC-004-068 (presign abuse), TC-004-069, 070, 071 (gates + visual)
- **Exploratory charters**: TC-004-072 (money-calendar race, 60 min), TC-004-073 (RBAC/thin-controller sweep, 45 min)

## Suite mapping summary

| Suite | Cases | Cumulative time | Blocker rule |
|---|---|---|---|
| Smoke | 12 | ≤15 min | any fail → release blocked |
| Sanity | Smoke + 15 | ≤45 min | fail → blocked or waived with defect |
| Full | 73 (all TCs incl. charters) | ~0.5 day | fail → fix before RC promotion |

## Known staging-blocked items (trace to evidence)

- NFR-401/402/405 measurements (T111 quickstart timings, RSS probe, DR drill run) — attach to `evidence/` when staging session happens (TC-004-067).
- T112 rollback rehearsal — schedule alongside Full Regression.
- Playwright journeys (T115) — run before manual Full Regression to keep manual effort bounded.
