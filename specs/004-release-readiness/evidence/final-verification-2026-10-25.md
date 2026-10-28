# 004 Release Readiness — Final Verification Evidence (2026-10-25)

## Quality gates (all green)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 errors |
| Unit tests | `npx jest` | 50 suites / 367 tests PASS |
| Lint | `npx eslint app components lib` | 0 errors (26 pre-existing warnings: img-element, unused vars) |
| i18n coverage (FR-411/NFR-406) | `node scripts/i18n-coverage-gate.mjs` | PASS — 100% key resolution, ru/en parity, ICU other-forms (249 used keys) |
| Design tokens (FR-431) | `node scripts/design-token-gate.mjs` | PASS — zero generic-palette/raw-hex in brand/semantic roles |
| Supply chain (NIST SSDF) | `node scripts/verify-licenses.mjs` | PASS — zero AGPL/GPL/MSCL/ELv2 |
| npm audit | `npm audit` | 4 (2 low, 2 high) — both high = zod GHSA-mrhx-c7xc-m3w5, MITIGATED via T091 payload caps (zod@4 patch is breaking; plan pins zod 3) |
| DB migration | `npx prisma migrate deploy` | Applied cleanly to local Postgres; expand-only, down.sql verified by db-gist-and-migration test |

## Environment-blocked tasks (staging required)

- T111 quickstart tracer bullet — needs fresh instance (staging VPS)
- T112 rollback rehearsal — killswitch semantics unit-verified; scratch-env rehearsal on staging
- T115 Playwright journeys (tests/e2e/booking-flow.spec.ts, commerce-flow.spec.ts) — need running instance

## Disposal verification (ISO 12207 / Constitution XI)

- Spike branches deleted (T007); zero prototype code (grep-verified)
- Hand-built payment URL branch removed (T022)
- ×100 arithmetic removed from payment paths (T026)
- Fake-PASS DR stub retired by T094 real-restore drill script
