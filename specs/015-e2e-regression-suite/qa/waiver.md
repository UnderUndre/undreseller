# QA Waiver — 015-e2e-regression-suite (Principle XII)

**Date**: 2026-11-19 · **Feature**: 015-e2e-regression-suite · **Waiver**: full manual QA contour (`requirements-audit` + `qa/{rtm-matrix,test-cases,uat-scenarios,regression-suite}.md`) replaced by **RTM-lite** (`qa/rtm.md`).

**Reason**: the feature deliverable IS an automated Playwright regression suite. Traceability is provided by `qa/rtm.md` (FR-1501..1509 → executable spec files) and the tests themselves are the executable acceptance evidence. A parallel manual test-case matrix would duplicate the suite it governs (Via Negativa: no decorative artifacts).

**Compensating controls**:
- `/speckit.analyze` run #1 PASS (coverage 100%, constitution aligned);
- external review #1 (antigravity, CRITICAL) — 7/7 findings verified TRUE by zcode and remediated in commit `75d2c31` (spec v1.2: FR-1508/1509 + tasks T1504);
- suite-green gate: `pnpm test` (int 232 + e2e) must pass on T1541 before done.

Approved by the project owner (implement approval 2026-11-19, see `reviews/_gate-override.md`).
