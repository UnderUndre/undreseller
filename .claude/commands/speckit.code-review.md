---
description: SpecKit Code & PR Review. Adversarial multi-pass audit of code diffs or GitHub PRs. Filters false positives with confidence scoring (80+ threshold) and outputs structured findings with stable IDs.
---

## User Input

```text
$ARGUMENTS
```

Optional arguments:

- GitHub PR number / URL (e.g. `42`, `#42`, `https://github.com/.../pull/42`) -> PR mode
- Git ref or base branch (e.g. `origin/main`, `develop...HEAD`, `--staged`)
- Focus filter (`security`, `concurrency`, `leaks`, `sre`, `constitution`, `anti-slop`)

ultrathink

> "Критическая ошибка — что ты пришёл в эту профессию. Остальное можно поправить." — Code Review Roasts  
> "Всегда пиши код так, будто сопровождать его будет психопат, который знает, где ты живёшь." — Code Review Roasts  
> "I'm a systems architect. My job is to protect this platform from your code." — Гилфойл (_Silicon Valley_)

## Goal

Perform a **high-signal, ground-truthed adversarial code review** of code diffs or GitHub Pull Requests.  
Act as a Principal Staff Engineer, SRE, and Security Auditor.

**Does not** waste time on formatting, whitespace, linting rules, or import ordering (delegated to `biome`/`eslint`/`tsc`).  
**Does** catch logic bugs, race conditions, memory/connection leaks, security flaws, missing tests, unhandled error boundaries, and AI-generated bloat ("AI Slop").

---

## Operating Constraints

1. **READ-ONLY against codebase**: Do not modify source files during review.
2. **SMART DIFF SCOPING**:
   - PR Mode: use `gh pr diff <PR>` and `gh pr view <PR>`.
   - Local Diff Mode: detect default branch (`git symbolic-ref refs/remotes/origin/HEAD` or `main`/`master`), compute `git merge-base <default> HEAD`, and review all branch changes + working tree (staged & unstaged).
   - Ignore noise: ignore `*-lock.*`, `package-lock.json`, minified bundles, `.snap`, auto-generated SDKs/mocks/dist.
3. **NO PRE-EXISTING CODE NOISE**: Flag ONLY bugs introduced or directly impacted by the current diff. Do not report pre-existing legacy issues unless broken by this PR.
4. **CONFIDENCE THRESHOLD (80+)**: Score every potential finding 0–100.
   - `< 80`: Filter out (speculative, style preferences, low confidence).
   - `80–89`: High confidence (verified functional/security risk or constitution violation).
   - `90–100`: Critical / Blocker (deterministic bug, leak, SQLi/IDOR, data loss).
   - _Only report issues with Confidence >= 80._
5. **STRICT ID FORMATTING**: Every finding MUST use a stable sequential ID (`[F-01]`, `[F-02]`, etc.) for seamless `/speckit.fix-review` automation.
6. **GROUND TRUTH VERIFICATION**: Always read actual project files, package.json dependencies, and types before asserting an API is misused.

---

## Multi-Pass Inspection Pipeline

1. **Pass 1: Constitution & Architecture Compliance**  
   Validate changes against `.specify/memory/constitution.md`, `AGENTS.md`, and `CLAUDE.md`. Check for unauthorized patterns, architecture drift, modular monolith boundaries, and verify no raw exploratory spike/PoC code was leaked into production without clean rewrite.
2. **Pass 2: Security, Compliance & Secrets (ISO 27001 Control 8.28 / PCI DSS v4.0.1)**  
   Zero unmasked PII in logs or storage, no hardcoded secrets, raw SQL concatenation, IDOR, SSRF, or unsanitized shell inputs. Verify cryptographic posture and input validation at API boundaries (Zod/Pydantic).
3. **Pass 3: Concurrency, State & Async Hygiene**  
   Race conditions, unhandled Promise rejections, non-atomic mutations, event loop blocking.
4. **Pass 4: SRE, Leaks & Resource Boundaries**  
   Missing timeouts on network/DB calls, missing circuit breakers, unbounded collections/caches, open connections/file handles, unindexed DB queries.
5. **Pass 5: Database Zero-Downtime Safety (Expand/Contract Pattern)**  
   Reject breaking schema changes in 1 step: NO dropping columns, NO renaming columns without dual-write, NO adding NOT NULL without defaults, NO blocking table locks without CONCURRENTLY.
6. **Pass 6: Test Gaps, Simplicity & Anti-Slop**
   - Untested critical edge cases introduced in diff, lack of contract tests for public interfaces, empty/swallowed `catch {}` blocks, redundant AI hallucinations.
   - **Human Readability & Simplicity Gate ("Понимаю ли я, как эта херня работает?")**: Ask if the code design is clear to a human reviewer. If code works but is an unnecessarily complex, unreadable AI spaghetti-monster, REJECT (Confidence 85+) and mandate a simpler, readable implementation.

---

## Output Target

- If SpecKit feature active (`specs/<slug>/`): write to `specs/<slug>/reviews/code-<provider>.md`.
- Else: write to `docs/reviews/code-review-<provider>.md` (create directory if needed).
- Offer `gh pr comment <PR>` if in PR mode.

````markdown
# SpecKit Code Review Report

**Reviewer**: `<provider>`  
**Reviewed at**: `<ISO Timestamp>`  
**Mode**: `PR #<N>` | `Local Git Diff (<base>...<head>)`  
**Inspected Files**: `<count>`  
**Pass Status**: `BLOCKER: <count> | CRITICAL: <count> | WARNING: <count> | SUGGESTION: <count>`

---

### 1. 🚨 Critical Findings ([BLOCKER] / [CRITICAL])

#### [F-01] [CRITICAL] (Confidence: 95/100) <Short Description>

- **Location:** `path/to/file.ts:42`
- **Failure Scenario:** <Exact sequence of events leading to crash, data loss, or vulnerability>
- **Proposed Fix:**

```diff
- const user = await db.query(`SELECT * FROM users WHERE id = ${req.body.id}`);
+ const user = await db.query('SELECT * FROM users WHERE id = $1', [req.body.id]);
```
````

---

### 2. ⚠️ Performance & Reliability ([WARNING])

#### [F-02] [WARNING] (Confidence: 85/100) <Short Description>

- **Location:** `path/to/file.ts:108`
- **Failure Scenario:** <High-load / memory leak / latency spike risk>
- **Proposed Fix:**

```diff
- return items.map(async (item) => await fetchDetails(item.id));
+ return Promise.all(items.map((item) => fetchDetails(item.id)));
```

---

### 3. 🧹 Architecture, Tests & Anti-Slop ([SUGGESTION])

#### [F-03] [SUGGESTION] (Confidence: 80/100) <Short Description>

- **Location:** `path/to/file.ts:15`
- **Failure Scenario:** <Swallowed exception / missing test boundary / constitution violation>
- **Proposed Fix:**

```diff
- try { return JSON.parse(str); } catch (e) { return null; }
+ return safeJsonParse(str);
```

---

## VERDICT

```yaml
verdict: PASS | MEDIUM | HIGH | CRITICAL
reviewer: <provider>
reviewed_at: <ISO>
critical_count: <N>
high_count: <N>
warning_count: <N>
suggestion_count: <N>
```

- **If 0 BLOCKER and 0 CRITICAL**: `LGTM — No high-confidence risks detected. Ready to ship.`
- **If >0 BLOCKER or CRITICAL**: `REWORK REQUIRED — Resolve BLOCKER / CRITICAL findings before merging.`

```

Print summary to terminal with finding counts and path of review file.
Suggest: Run `/speckit.fix-review` to apply automated patches.
```
