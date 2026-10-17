---
description: Automatically apply precise code fixes from SpecKit review reports with atomic verification, test checks, and rollback on failure.
---

## User Input

```text
$ARGUMENTS
```

Optional arguments:

- Path to review report (e.g. `docs/reviews/code-review-claude.md` or `specs/001-feature/reviews/code-claude.md`)
- Scope filter: `--blockers-only`, `--critical-only`, `--warnings-included`
- Finding ID filter: `F-01`, `F-02,F-05` (applies only specified finding IDs)

ultrathink

> "Короче, стажёр, я твой стояк прочистил и в благородство играть не буду: накрутишь пару муфт на бэкенде — и мы в расчёте." — Сидорович (_Digital Plumber Edition_)  
> "Короче, кодер, я твой прод откатил и в благородство играть не буду: пара багфиксов — и мы в расчёте." — Сидорович (_S.T.A.L.K.E.R._)

## Goal

Parse finding reports from `/speckit.code-review` or specified review report files.  
Apply minimal, robust code fixes to unresolved findings (`BLOCKER`, `CRITICAL`, `WARNING`), verify with tests, atomically rollback failures, and update the review report ledger.

---

## Operating Constraints

1. **GIT PRE-FLIGHT CHECK**: Inspect `git status`. If dirty working tree contains unrelated unstaged edits, warn user or ensure changes can be safely isolated.
2. **MINIMAL SURGICAL FIXES**: Never refactor beyond the scope of the reported finding diff.
3. **ATOMIC FIX & ROLLBACK**:
   - Apply fixes one finding at a time.
   - Run typecheck and relevant test after each finding.
   - If tests fail and cannot be cleanly fixed in 1 step: **revert the changed file (`git checkout -- <file>`)** and mark finding as `[FAILED_VERIFICATION]`.
4. **REPORT LEDGER SYNC**: Update the original review markdown report:
   - Mark fixed items as `#### [F-XX] [RESOLVED]`
   - Mark rejected/invalid items as `#### [F-XX] [REJECTED: reason]`
   - Mark failed verification as `#### [F-XX] [FAILED_VERIFICATION: reason]`

---

## Execution Workflow

### 1. Parse & Filter Findings

- Read target review markdown file from arguments or search `specs/<slug>/reviews/` / `docs/reviews/`.
- Extract findings: ID (`F-XX`), severity, file location, confidence score, and diff snippet.
- Filter based on arguments (e.g. specific IDs `F-01`, severity filters).

### 2. Baseline Health Check

- Run a fast baseline check (`npm test -- --bail` or `tsc --noEmit`) to ensure the test suite is not already broken before making edits.

### 3. Iterative Fix Loop (Per Finding)

For each target finding:

1. Open and inspect `path/to/file.ext:LineNumber` in context.
2. Check if the issue is still present (avoid redundant edits).
3. Apply the proposed fix accurately using file edit tools.
4. Run fast validation:
   - Lint / Typecheck: `tsc --noEmit` / `biome check` / `cargo check`
   - Targeted unit tests: `npm test -- <path-to-test-file>`
5. If validation passes: keep changes and log success.
6. If validation fails: attempt 1 minor adjustment; if still failing, **revert changes to that file** and log failure.

### 4. Full Verification Suite

- Once all candidate findings are processed, run the full project test suite.

### 5. Sync Ledger & Summary Report

- Write updated statuses back to the review `.md` file.
- Print final terminal summary:
  ```text
  [FIXED]  F-01: SQL injection sanitized in api/users.ts:42
  [FIXED]  F-02: Missing Promise.all wrapped in services/fetcher.ts:108
  [REVERT] F-03: Verification failed (typecheck error) -> rolled back
  [TESTS]  All remaining test suites passing (24/24 passed).
  ```
