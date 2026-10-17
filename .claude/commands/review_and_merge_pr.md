---
description: Review open GitHub Pull Requests starting from the oldest, perform adversarial audit via gh CLI, and merge upon passing tests and review gates.
---

## User Input

```text
$ARGUMENTS
```

Optional arguments:

- Specific PR number (e.g. `42` or `#42`)
- `--auto-merge` (merge immediately if review PASS and tests GREEN)
- `--oldest-first` (default: process PR queue from oldest to newest)

ultrathink

> "Мержить говнокод в main — это всё равно что залить цемент в фановый стояк. Сначала опрессовка и прочистка, потом подпись и запуск." — Valera

## Goal

Automate the audit, review, and merging of GitHub Pull Requests using `gh` CLI.  
Ensures no untested, unreviewed, or broken code reaches `main`.

---

## Operating Constraints

1. **USE `gh` CLI FOR ALL PR OPS**: `gh pr list`, `gh pr diff`, `gh pr review`, `gh pr merge`.
2. **APPLY ADVERSARIAL REVIEW STANDARDS**: Run `/code_review` multi-pass audit on PR diff before approving.
3. **NEVER FORCE MERGE BROKEN CI**: Verify GitHub Actions / CI status (`gh pr checks`) before merging.

---

## Execution Workflow

### 1. Identify PR Queue

- If PR number provided in `$ARGUMENTS` → target PR `#<N>`.
- Else → query open PRs: `gh pr list --state open --sort created --order asc --limit 10`.

### 2. Fetch PR Context & Diff

For target PR:

- Checkout or inspect diff: `gh pr diff <PR_NUMBER>`
- Check CI status: `gh pr checks <PR_NUMBER>`
- Read PR description and linked issues.

### 3. Execute Adversarial Audit

Run multi-pass inspection on PR diff:

- **Pass 1:** Security (secrets, injections, unmasked PII)
- **Pass 2:** Concurrency (race conditions, async rejections)
- **Pass 3:** Resource Leaks (unclosed streams/pools, N+1 queries)
- **Pass 4:** Anti-Slop (redundant defensive code, dead wrappers)

### 4. Post Review Comment / Verdict

- If `BLOCKER` / `CRITICAL` issues found:  
  Post review requesting changes: `gh pr review <PR_NUMBER> --request-changes --body "<formatted findings>"`
- If zero critical issues and CI checks PASS:  
  Post approval: `gh pr review <PR_NUMBER> --approve --body "LGTM — Adversarial audit passed without critical risks."`

### 5. Merge Execution (If Authorized)

If approved and user specified `--auto-merge` or confirmed merge:

- Execute squash/rebase merge: `gh pr merge <PR_NUMBER> --squash --delete-branch`
- Output: "PR #<N> merged successfully. Branch deleted."
